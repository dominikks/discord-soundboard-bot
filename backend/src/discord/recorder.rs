use crate::file_handling::RECORDINGS_FOLDER;
use crate::CacheHttp;
use serenity::async_trait;
use serenity::model::prelude::GuildId;
use serenity::model::voice_gateway::id::UserId;
use serenity::prelude::Mutex;
use serenity::prelude::RwLock;
use songbird::model::payload::Speaking;
use songbird::Call;
use songbird::CoreEvent;
use songbird::Event;
use songbird::EventContext;
use songbird::EventHandler as VoiceEventHandler;
use std::collections::HashMap;
use std::collections::VecDeque;
use std::env::var;
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

/// Samples per tick: 48kHz * 20ms * 2 channels = 1920 samples total
/// Divided by 2 channels = 960 samples per channel per tick
pub const SAMPLES_PER_TICK: usize = 960;

#[allow(dead_code)]
fn samples_to_duration(samples: usize) -> Duration {
    Duration::from_nanos((samples as f64 / SAMPLE_RATE / CHANNEL_COUNT as f64 * 1e9).round() as u64)
}

#[allow(dead_code)]
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
    start_tick: u64,
    end_tick: Option<u64>, // None = still recording, Some = ended
    data: Vec<i16>,
}

struct UserData {
    user_id: UserId,
    recordings: VecDeque<VoiceRecording>,
    last_voice_activity: SystemTime,
}

struct GuildRecorder {
    guild_id: GuildId,
    /// Maps an ssrc to a user
    users: Arc<RwLock<HashMap<u32, Arc<Mutex<UserData>>>>>,
    /// Tick counter for precise timing synchronization
    tick_counter: Arc<Mutex<u64>>,
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
                // We use tick numbers for precise synchronization (1 tick = 20ms)
                let current_tick = {
                    let mut tick_counter = self.tick_counter.lock().await;
                    *tick_counter += 1;
                    *tick_counter
                };

                // Process speaking users - extend or create recordings
                for (ssrc, decoded_voice) in voice_tick.speaking.iter() {
                    let audio = decoded_voice.decoded_voice.as_ref();

                    if let Some(audio) = audio {
                        trace!(
                            ssrc = ssrc,
                            tick = current_tick,
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

                            // Check if we have an active recording (end_tick = None)
                            let has_active_recording = user
                                .recordings
                                .back()
                                .map(|r| r.end_tick.is_none())
                                .unwrap_or(false);

                            if has_active_recording {
                                // Extend the active recording
                                let recording = user
                                    .recordings
                                    .back_mut()
                                    .expect("Recordings cannot be empty");
                                recording.data.extend_from_slice(audio);

                                trace!(
                                    total_len = recording.data.len(),
                                    "Extending active recording"
                                );
                            } else {
                                // Create a new recording
                                user.recordings.push_back(VoiceRecording {
                                    start_tick: current_tick,
                                    end_tick: None, // Active recording
                                    data: audio.to_vec(),
                                });
                                trace!(
                                    recording_count = user.recordings.len(),
                                    len = audio.len(),
                                    "Starting new recording"
                                );
                            }
                            user.last_voice_activity = SystemTime::now();
                        }
                    }
                }

                // Process silent users - mark recordings as ended and cleanup
                let users = self.users.read().await;
                for (ssrc, user_lock) in users.iter() {
                    if !voice_tick.speaking.contains_key(ssrc) {
                        let mut user = user_lock.lock().await;

                        // Mark the active recording as ended
                        if let Some(recording) = user.recordings.back_mut() {
                            if recording.end_tick.is_none() {
                                recording.end_tick = Some(current_tick);
                                trace!(ssrc = ssrc, tick = current_tick, "Ending recording");
                            }
                        }

                        // Cleanup old recordings
                        self.cleanup_user_recordings(&mut user, current_tick);
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
            tick_counter: Arc::new(Mutex::new(0)),
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
    #[instrument(skip(self, user))]
    fn cleanup_user_recordings(&self, user: &mut MutexGuard<UserData>, current_tick: u64) {
        let mut counter: u32 = 0;

        // Remove recordings older than RECORDING_LENGTH seconds
        // 50 ticks per second (1 tick = 20ms)
        let max_age_ticks = *RECORDING_LENGTH * 50;

        while let Some(true) = user.recordings.front().map(|front| {
            // Check if recording is too old
            front.start_tick < current_tick.saturating_sub(max_age_ticks)
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
    }

    /// Saves the recording to disk
    #[instrument(skip(self, cache_and_http), err)]
    pub async fn save_channel_recording(
        &self,
        cache_and_http: &CacheHttp,
    ) -> Result<(), RecordingError> {
        let mut recordings: HashMap<UserId, VecDeque<VoiceRecording>> = HashMap::new();
        let current_tick = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64
            / 20; // Convert to tick number (20ms per tick)

        {
            let users = self.users.read().await;

            for user in users.values() {
                let mut user = user.lock().await;

                // Make sure we only consider recordings that are within scope
                self.cleanup_user_recordings(&mut user, current_tick);

                if !user.recordings.is_empty() {
                    recordings.insert(user.user_id, user.recordings.clone());
                }
            }
        }

        // Find the earliest start_tick and latest end_tick across all users
        let first_start_tick = recordings
            .iter()
            .filter_map(|(_, recs)| recs.front().map(|first_rec| first_rec.start_tick))
            .min()
            .ok_or(RecordingError::NoData)?;

        let last_end_tick = recordings
            .iter()
            .filter_map(|(_, recs)| {
                recs.back().and_then(|last_rec| {
                    // Use end_tick if available, otherwise current_tick
                    last_rec.end_tick.or(Some(current_tick))
                })
            })
            .max()
            .ok_or(RecordingError::NoData)?;

        debug!(
            recording_user_count = recordings.len(),
            first_start_tick, last_end_tick, "Saving recordings"
        );

        let folder = (*RECORDINGS_FOLDER)
            .join(self.guild_id.get().to_string())
            .join(
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
                first_start_tick,
                last_end_tick,
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
        first_start_tick: u64,
        last_end_tick: u64,
    ) -> Result<(), RecordingError> {
        // Add a last empty recording at last_end_tick to ensure everything ends at same timepoint
        rec.push_back(VoiceRecording {
            start_tick: last_end_tick,
            end_tick: Some(last_end_tick),
            data: Vec::new(),
        });

        // Assemble all the vectors into one big vector respecting gaps
        let mut data = Vec::new();
        let mut previous_end_tick = first_start_tick;

        trace!(
            recording_count = rec.len(),
            first_start_tick,
            last_end_tick,
            "Saving recording of user"
        );

        for mut r in rec.into_iter() {
            // Calculate gap in ticks
            let gap_ticks = r.start_tick.saturating_sub(previous_end_tick);

            if gap_ticks > 0 {
                // Fill gap with silence: gap_ticks * SAMPLES_PER_TICK * CHANNEL_COUNT
                let missing_samples =
                    gap_ticks as usize * SAMPLES_PER_TICK * CHANNEL_COUNT as usize;
                trace!(gap_ticks, missing_samples, "Filling in recording gap");
                data.append(&mut vec![0; missing_samples]);
            }

            // Update previous_end_tick before mutating r
            previous_end_tick = r.end_tick.unwrap_or(r.start_tick);
            data.append(&mut r.data);
        }
        debug!("Extracted {} samples", data.len());

        // Convert songbird's UserId to serenity's UserId
        let serenity_user_id = serenity::model::prelude::UserId::new(user_id.0);
        let name = guild_id
            .member(cache_and_http, serenity_user_id)
            .await
            .map(|member| member.user.name)
            .unwrap_or_else(|_| user_id.0.to_string());

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
