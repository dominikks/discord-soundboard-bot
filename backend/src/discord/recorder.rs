use crate::file_handling::RECORDINGS_FOLDER;
use crate::CacheHttp;
use serenity::async_trait;
use serenity::model::prelude::GuildId;
use serenity::model::voice_gateway::id::UserId;
use serenity::prelude::Mutex;
use serenity::prelude::RwLock;
use songbird::events::context_data::SpeakingUpdateData;
use songbird::events::context_data::VoiceData;
use songbird::model::payload::Speaking;
use songbird::Call;
use songbird::CoreEvent;
use songbird::Event;
use songbird::EventContext;
use songbird::EventHandler as VoiceEventHandler;
use std::collections::HashMap;
use std::collections::VecDeque;
use std::env::var;
use std::fmt;
use std::num::Wrapping;
use std::ops::Deref;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::SystemTime;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::sync::MutexGuard;
use tokio::time::sleep;
use tokio::time::Duration;
use tracing::Instrument;
use tracing::Level;

lazy_static! {
    static ref RECORDING_LENGTH: u64 = var("RECORDING_LENGTH")
        .ok()
        .and_then(|content| content.parse::<u64>().ok())
        .unwrap_or(60);
}

/// The sample rate and channel count the voice stream is assumed to have
pub const SAMPLE_RATE: f64 = 48_000.0;
pub const CHANNEL_COUNT: u8 = 2;

fn samples_to_duration(samples: usize) -> Duration {
    Duration::from_nanos((samples as f64 / SAMPLE_RATE / CHANNEL_COUNT as f64 * 1e9).round() as u64)
}
fn nanos_to_samples(nanos: u128) -> usize {
    (nanos as f64 * 1e-9 * SAMPLE_RATE * CHANNEL_COUNT as f64).round() as usize
}

#[derive(Debug)]
pub enum RecordingError {
    IoError(std::io::Error),
    NoData,
}

impl fmt::Display for RecordingError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::result::Result<(), std::fmt::Error> {
        match self {
            RecordingError::NoData => write!(f, "RecordingError: no data to record"),
            RecordingError::IoError(err) => write!(f, "RecordingError: IoError occurred. {}", err),
        }
    }
}

impl From<std::io::Error> for RecordingError {
    fn from(err: std::io::Error) -> Self {
        RecordingError::IoError(err)
    }
}

#[derive(Clone)]
struct VoiceRecording {
    timestamp: SystemTime,
    data: Vec<i16>,
}

struct UserData {
    user_id: UserId,
    last_voice_activity: SystemTime,
    last_rtp_timestamp: Wrapping<u32>,
    recordings: VecDeque<VoiceRecording>,
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
    #[instrument(skip(self, ctx), fields(guild_id = self.guild_id.0))]
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
                                    recordings: Default::default(),
                                })),
                            );
                        }

                        // When this user was newly added and did not exist before, we spawn a garbage collector
                        self.spawn_user_gc(*ssrc);
                    }
                }
            }
            Ctx::SpeakingUpdate(SpeakingUpdateData { ssrc, speaking, .. }) => {
                trace!(
                    "Source {} has {} speaking",
                    ssrc,
                    if *speaking { "started" } else { "stopped" },
                );

                // Once a user stops speaking, we cleanup their recordings
                if !*speaking {
                    let user_lock;
                    {
                        let users = self.users.read().await;
                        user_lock = users.get(ssrc).cloned()?;
                    }

                    let mut user = user_lock.lock().await;
                    self.cleanup_user_recordings(&mut user);
                }
            }
            Ctx::VoicePacket(VoiceData { audio, packet, .. }) => {
                // An event which fires for every received audio packet,
                // containing the decoded data.
                if let Some(audio) = audio {
                    trace!(
                        ssrc = packet.ssrc,
                        "Audio packet sequence {:05} has {:04} bytes (decompressed from {})",
                        packet.sequence.0,
                        audio.len() * std::mem::size_of::<i16>(),
                        packet.payload.len(),
                    );

                    let user_lock;
                    {
                        let users = self.users.read().await;
                        user_lock = users.get(&packet.ssrc).cloned()?;
                    }

                    let mut user = user_lock.lock().await;

                    if usize::try_from((packet.timestamp.0 - user.last_rtp_timestamp).0).ok()?
                        * std::mem::size_of::<i16>()
                        == audio.len()
                        && !user.recordings.is_empty()
                    {
                        // If this recording is the continuation of the previous one, we simply append
                        let recording = user
                            .recordings
                            .back_mut()
                            .expect("Recordings cannot be empty");
                        recording.data.extend(audio);

                        trace!(
                            total_len = recording.data.len(),
                            "Extended existing recording"
                        );
                    } else {
                        // If it is a new recording, we create a new entry
                        user.recordings.push_back(VoiceRecording {
                            timestamp: SystemTime::now(),
                            data: audio.clone(),
                        });
                        trace!(
                            recording_count = user.recordings.len(),
                            len = audio.len(),
                            "Added new recording"
                        );
                    }
                    user.last_voice_activity = SystemTime::now();
                    user.last_rtp_timestamp = packet.timestamp.0;
                } else {
                    error!("RTP packet, but no audio. Driver may not be configured to decode.");
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

        let folder = (*RECORDINGS_FOLDER).join(self.guild_id.0.to_string()).join(
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

    #[instrument(skip(cache_and_http, rec, folder))]
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

        trace!(recording_count = rec.len(), "Saving recording of user");

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
            call.add_global_event(CoreEvent::SpeakingUpdate.into(), guild_recorder.clone());
            call.add_global_event(CoreEvent::VoicePacket.into(), guild_recorder);
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
