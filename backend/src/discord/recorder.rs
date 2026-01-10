use crate::file_handling::RECORDINGS_FOLDER;
use crate::CacheHttp;
use serenity::async_trait;
use serenity::model::prelude::GuildId;
use serenity::model::voice_gateway::id::UserId;
use serenity::prelude::Mutex;
use serenity::prelude::RwLock;
use songbird::events::context_data::VoiceTick;
use songbird::model::payload::Speaking;
use songbird::Call;
use songbird::CoreEvent;
use songbird::Event;
use songbird::EventContext;
use songbird::EventHandler as VoiceEventHandler;
use std::collections::HashMap;
use std::collections::VecDeque;
use std::env::var;
use std::num::Wrapping;
use std::ops::Deref;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::LazyLock;
use std::time::SystemTime;
use thiserror::Error;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::sync::MutexGuard;
use tokio::time::sleep;
use tokio::time::Duration;
use tracing::Instrument;
use tracing::Level;

static RECORDING_LENGTH: LazyLock<u64> = LazyLock::new(|| {
    var("RECORDING_LENGTH")
        .ok()
        .and_then(|content| content.parse::<u64>().ok())
        .unwrap_or(60)
});

/// The sample rate and channel count the voice stream is assumed to have
pub const SAMPLE_RATE: f64 = 48_000.0;
pub const CHANNEL_COUNT: u8 = 2;

fn samples_to_duration(samples: usize) -> Duration {
    Duration::from_nanos((samples as f64 / SAMPLE_RATE / CHANNEL_COUNT as f64 * 1e9).round() as u64)
}
fn nanos_to_samples(nanos: u128) -> usize {
    (nanos as f64 * 1e-9 * SAMPLE_RATE * CHANNEL_COUNT as f64).round() as usize
}

#[derive(Debug, Error)]
pub enum RecordingError {
    #[error("I/O error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("No data available to record")]
    NoData,
}

#[derive(Clone)]
struct VoiceRecording {
    // The timestamp is the start time of the recording
    timestamp: SystemTime,
    data: Vec<i16>,
}

struct UserData {
    user_id: UserId,
    recordings: VecDeque<VoiceRecording>,
    last_voice_activity: SystemTime,
    last_rtp_timestamp: Wrapping<u32>,
    last_sequence: Wrapping<u16>,
}

struct GuildRecorder {
    guild_id: GuildId,
    /// Maps an ssrc to a user
    users: Arc<RwLock<HashMap<u32, Arc<Mutex<UserData>>>>>,
}

#[derive(Clone)]
struct GuildRecorderArc(Arc<GuildRecorder>);

impl Deref for GuildRecorderArc {
    type Target = Arc<GuildRecorder>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[async_trait]
impl VoiceEventHandler for GuildRecorderArc {
    #[instrument(skip(self, ctx), fields(guild_id = self.guild_id.get()))]
    async fn act(&self, ctx: &EventContext<'_>) -> Option<Event> {
        use EventContext as Ctx;
        match ctx {
            Ctx::SpeakingStateUpdate(Speaking { ssrc, user_id, .. }) => {
                if let Some(user_id) = user_id {
                    let is_new_user;
                    {
                        let users = self.users.read().await;
                        is_new_user = !users.contains_key(ssrc);
                    }
                    debug!(
                        ?is_new_user,
                        ?user_id,
                        ?ssrc,
                        "Speaking state update received"
                    );

                    if is_new_user {
                        {
                            let mut users = self.users.write().await;
                            users.insert(
                                *ssrc,
                                Arc::new(Mutex::new(UserData {
                                    user_id: *user_id,
                                    last_voice_activity: SystemTime::now(),
                                    last_rtp_timestamp: Wrapping(0),
                                    last_sequence: Wrapping(0),
                                    recordings: Default::default(),
                                })),
                            );
                        }

                        // When this user was newly added and did not exist before, we spawn a garbage collector
                        self.spawn_user_gc(*ssrc);
                    }
                }
            }
            Ctx::VoiceTick(voice_tick) => {
                // VoiceTick event provides decoded voice data for all speaking users
                // In songbird 0.5, the event structure changed significantly
                // We process based on SSRC keys
                for (ssrc, decoded_voice) in voice_tick.speaking.iter() {
                    let audio = decoded_voice.decoded_voice.as_ref();
                    
                    if let Some(audio) = audio {
                        trace!(
                            ssrc = ssrc,
                            "Audio data has {:04} bytes",
                            audio.len() * std::mem::size_of::<i16>(),
                        );

                        let user_lock;
                        {
                            let users = self.users.read().await;
                            user_lock = users.get(ssrc).cloned();
                        }

                        if let Some(user_lock) = user_lock {
                            let mut user = user_lock.lock().await;

                            // In songbird 0.5, we don't have sequence numbers in VoiceTick
                            // so we always append or create new recordings based on gaps
                            if !user.recordings.is_empty() {
                                // Always extend the last recording if it exists
                                let recording = user
                                    .recordings
                                    .back_mut()
                                    .expect("Recordings cannot be empty");
                                recording.data.extend_from_slice(audio);

                                trace!(
                                    total_len = recording.data.len(),
                                    "Extending existing recording"
                                );
                            } else {
                                // If it is a new recording, we create a new entry
                                user.recordings.push_back(VoiceRecording {
                                    timestamp: SystemTime::now() - samples_to_duration(audio.len()),
                                    data: audio.to_vec(),
                                });
                                trace!(
                                    recording_count = user.recordings.len(),
                                    len = audio.len(),
                                    "Adding new recording"
                                );
                            }
                            user.last_voice_activity = SystemTime::now();
                            // Note: In songbird 0.5 VoiceTick, we don't have RTP timestamps/sequences
                            // so we can't track them the same way
                        }
                    }
                }

                // Check for users who stopped speaking
                let users = self.users.read().await;
                for (ssrc, user_lock) in users.iter() {
                    if !voice_tick.speaking.contains_key(ssrc) {
                        let mut user = user_lock.lock().await;
                        self.cleanup_user_recordings(&mut user);
                    }
                }
            }
            _ => {
                // We won't be registering this struct for any more event classes.
                unimplemented!()
            }
        }

        None
    }
}

impl GuildRecorderArc {
    pub fn new(guild_id: GuildId) -> Self {
        GuildRecorderArc(Arc::new(GuildRecorder {
            guild_id,
            users: Default::default(),
        }))
    }

    /// Spawns a garbage collector thread for the given user. The thread periodically checks whether the user is
    /// inactive and removes them if so.
    #[instrument(skip(self))]
    fn spawn_user_gc(&self, ssrc: u32) {
        let users_lock = self.users.clone();
        let span = span!(Level::INFO, "user_gc", ssrc);
        tokio::spawn(
            async move {
                // Delete the user if no voice activity in the last hour
                loop {
                    trace!("Sleeping");
                    sleep(Duration::from_secs(60 * 60 * 2)).await;

                    let delete;
                    {
                        let users = users_lock.read().await;
                        if let Some(user_mutex) = users.get(&ssrc) {
                            let user = user_mutex.lock().await;
                            delete = SystemTime::now()
                                .duration_since(user.last_voice_activity)
                                .unwrap()
                                > Duration::from_secs(60 * 60);
                        } else {
                            debug!("User already deleted");
                            break;
                        }
                    }

                    debug!(delete, "Checking timeout of user data");

                    if delete {
                        let mut users = users_lock.write().await;
                        users.remove(&ssrc);
                        debug!("{} remaining known users", users.len());
                        break;
                    }
                }
            }
            .instrument(span),
        );
    }

    /// Cleans up timed out recordings for a user
    #[instrument(skip(self, user), fields(user_id = user.user_id.0))]
    fn cleanup_user_recordings(&self, user: &mut MutexGuard<UserData>) -> Option<()> {
        let mut counter: u32 = 0;

        while let Some(true) = user.recordings.front().map(|front| {
            SystemTime::now().duration_since(front.timestamp).unwrap()
                > Duration::from_secs(*RECORDING_LENGTH) + samples_to_duration(front.data.len())
        }) {
            user.recordings
                .pop_front()
                .expect("Missing element in Deque");
            counter += 1;
        }

        debug!(
            remaining_recordings = user.recordings.len(),
            "Removed {} timed out recordings", counter
        );

        Some(())
    }

    /// Saves the recording to disk
    #[instrument(skip(self, cache_and_http), err)]
    pub async fn save_channel_recording(
        &self,
        cache_and_http: &CacheHttp,
    ) -> Result<(), RecordingError> {
        let mut recordings: HashMap<UserId, VecDeque<VoiceRecording>> = HashMap::new();
        {
            let users = self.users.read().await;

            for user in users.values() {
                let mut user = user.lock().await;

                // Make sure we only consider recordings that are within scope
                self.cleanup_user_recordings(&mut user);

                if !user.recordings.is_empty() {
                    recordings.insert(user.user_id, user.recordings.clone());
                }
            }
        }

        // We make all files have the same length by padding them at the start
        let first_start_time = recordings
            .iter()
            .filter_map(|(_, recs)| recs.front().map(|first_rec| first_rec.timestamp))
            .min()
            .ok_or(RecordingError::NoData)?;
        let last_end_time = recordings
            .iter()
            .filter_map(|(_, recs)| {
                recs.back()
                    .map(|last_rec| last_rec.timestamp + samples_to_duration(last_rec.data.len()))
            })
            .max()
            .ok_or(RecordingError::NoData)?;

        debug!(
            recording_user_count = recordings.len(),
            ?first_start_time,
            ?last_end_time,
            "Saving recordings"
        );

        let folder = (*RECORDINGS_FOLDER).join(self.guild_id.get().to_string()).join(
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs()
                .to_string(),
        );
        fs::create_dir_all(&folder).await?;

        let mut tasks = Vec::new();
        for (uid, rec) in recordings.into_iter() {
            tasks.push(tokio::spawn(GuildRecorderArc::save_user_recording(
                cache_and_http.clone(),
                self.guild_id,
                uid,
                rec,
                folder.clone(),
                first_start_time,
                last_end_time,
            )));
        }

        for join_handle in tasks {
            join_handle.await.map_err(std::io::Error::from)??;
        }

        Ok(())
    }

    #[instrument(skip(cache_and_http, rec, folder, first_start_time, last_end_time))]
    async fn save_user_recording(
        cache_and_http: CacheHttp,
        guild_id: GuildId,
        user_id: UserId,
        mut rec: VecDeque<VoiceRecording>,
        folder: PathBuf,
        first_start_time: SystemTime,
        last_end_time: SystemTime,
    ) -> Result<(), RecordingError> {
        // Add a last empty recording at last_end_time to ensure everything ends at same timepoint
        rec.push_back(VoiceRecording {
            timestamp: last_end_time,
            data: Vec::new(),
        });

        // Assemble all the vectors into one big vector respecting gaps
        let mut data = Vec::new();
        let mut previous_end = first_start_time;

        trace!(
            recording_count = rec.len(),
            ?first_start_time,
            ?last_end_time,
            "Saving recording of user"
        );

        for mut r in rec.into_iter() {
            // Fill in possible gap. If there is overlap (raises SystemTimeError), we just append and ignore.
            let diff = r
                .timestamp
                .duration_since(previous_end)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            trace!(?diff, ?previous_end, ?r.timestamp, "Filling in recording gap");

            let missing_samples = nanos_to_samples(diff);
            data.append(&mut vec![0; missing_samples]);

            // Update previous_end before mutating r
            previous_end = r.timestamp + samples_to_duration(r.data.len());
            data.append(&mut r.data);
        }
        debug!("Extracted {} samples", data.len());

        let UserId(uid) = user_id;
        let name = guild_id
            .member(cache_and_http, uid)
            .await
            .map(|member| member.user.name)
            .unwrap_or_else(|_| uid.to_string());

        let file = folder.join(sanitize_filename::sanitize(format!("{}.mp3", name)));
        let args = [
            "-f",
            "s16le",
            "-ar",
            &SAMPLE_RATE.to_string(),
            "-ac",
            &CHANNEL_COUNT.to_string(),
            "-i",
            "pipe:",
        ];
        let mut child = Command::new("ffmpeg")
            .kill_on_drop(true)
            .args(args)
            .arg(file.as_os_str())
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?;
        {
            let child_stdin = child.stdin.as_mut().unwrap();
            for d in data {
                child_stdin.write_i16_le(d).await?;
            }
        }

        child.wait_with_output().await?;
        Ok(())
    }
}

pub struct Recorder {
    guilds: RwLock<HashMap<GuildId, GuildRecorderArc>>,
}

impl Recorder {
    pub fn create() -> Arc<Self> {
        Arc::new(Self {
            guilds: Default::default(),
        })
    }

    /// Register the recorder as event handler
    pub async fn register_with_call(
        self: &Arc<Self>,
        guild_id: GuildId,
        call_lock: Arc<Mutex<Call>>,
    ) {
        let guild_recorder;
        {
            let mut guilds = self.guilds.write().await;
            guild_recorder = guilds
                .entry(guild_id)
                .or_insert_with(|| GuildRecorderArc::new(guild_id))
                .clone();
        }

        {
            let mut call = call_lock.lock().await;
            call.add_global_event(
                CoreEvent::SpeakingStateUpdate.into(),
                guild_recorder.clone(),
            );
            call.add_global_event(CoreEvent::VoiceTick.into(), guild_recorder);
        }
    }

    /// Saves the recording to disk
    #[instrument(skip(self, cache_and_http), err)]
    pub async fn save_recording(
        &self,
        guild_id: GuildId,
        cache_and_http: &CacheHttp,
    ) -> Result<(), RecordingError> {
        let guild_recorder;
        {
            let guilds = self.guilds.read().await;
            guild_recorder = guilds.get(&guild_id).ok_or(RecordingError::NoData)?.clone();
        }

        guild_recorder.save_channel_recording(cache_and_http).await
    }
}
