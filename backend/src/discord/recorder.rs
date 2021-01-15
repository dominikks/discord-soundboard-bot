use crate::file_handling::RECORDINGS_FOLDER;
use crate::CacheHttp;
use lazy_static::lazy_static;
use serenity::async_trait;
use serenity::client::ClientBuilder;
use serenity::client::Context;
use serenity::model::prelude::GuildId;
use serenity::model::voice_gateway::id::UserId;
use serenity::prelude::Mutex;
use serenity::prelude::RwLock;
use serenity::prelude::TypeMapKey;
use songbird::model::payload::ClientConnect;
use songbird::model::payload::ClientDisconnect;
use songbird::model::payload::Speaking;
use songbird::Call;
use songbird::CoreEvent;
use songbird::Event;
use songbird::EventContext;
use songbird::EventHandler as VoiceEventHandler;
use std::collections::HashMap;
use std::env::var;
use std::path::Path;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::SystemTime;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::sleep;
use tokio::time::Duration;
use tracing::debug;
use tracing::error;
use tracing::info;
use tracing::instrument;
use tracing::span;
use tracing::trace;
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

/// Key used to put the Recorders into the serenity TypeMap
struct RecorderKey;

impl TypeMapKey for RecorderKey {
  type Value = Arc<Recorder>;
}

struct VoiceRecording {
  start: SystemTime,
  data: Vec<i16>,
}

impl VoiceRecording {
  pub fn new() -> Self {
    Self {
      start: SystemTime::now(),
      data: Default::default(),
    }
  }
}

struct UserData {
  user_id: UserId,
  guild_id: GuildId,
  last_voice_activity: SystemTime,
}

#[derive(Debug)]
pub enum RecordingError {
  IoError(std::io::Error),
  NoData,
}

impl From<std::io::Error> for RecordingError {
  fn from(err: std::io::Error) -> Self {
    RecordingError::IoError(err)
  }
}

pub struct Recorder {
  /// Contains currently running recordings
  active: RwLock<HashMap<u32, VoiceRecording>>,
  /// Contains all recordings for this ssrc up to this point
  archive: RwLock<HashMap<u32, HashMap<SystemTime, VoiceRecording>>>,
  /// Maps an ssrc to a user
  users: RwLock<HashMap<u32, UserData>>,
}

impl Recorder {
  pub fn create() -> Arc<Self> {
    Arc::new(Self {
      active: Default::default(),
      archive: Default::default(),
      users: Default::default(),
    })
  }

  /// Saves the recording to disk
  #[instrument(skip(self, cache_and_http))]
  pub async fn save_recording(
    &self,
    guild_id: GuildId,
    cache_and_http: &CacheHttp,
  ) -> Result<(), RecordingError> {
    let relevant_users: HashMap<u32, UserId>;
    {
      let users = self.users.read().await;
      relevant_users = users
        .iter()
        .filter(|(_, user)| user.guild_id == guild_id)
        .map(|(ssrc, user)| (ssrc.clone(), user.user_id.clone()))
        .collect();
    }
    info!("Saving recordings of {} users", relevant_users.len());

    let mut recordings: HashMap<UserId, Vec<VoiceRecording>> = HashMap::new();
    {
      let mut active = self.active.write().await;
      let mut archive = self.archive.write().await;

      for (ssrc, uid) in relevant_users {
        let mut rec = Vec::new();

        if let Some(arch) = archive.remove(&ssrc) {
          let mut v: Vec<_> = arch.into_iter().map(|(_k, v)| v).collect();
          v.sort_by(|a, b| a.start.partial_cmp(&b.start).unwrap());
          rec.extend(v);
        }

        if let Some(act) = active.remove(&ssrc) {
          rec.push(act);
        }

        if !rec.is_empty() {
          recordings.insert(uid, rec);
        }
      }
    }

    // We make all files have the same length by padding them at the start
    let first_start_time = recordings
      .iter()
      .filter_map(|(_, recs)| recs.first().map(|first_rec| first_rec.start))
      .min()
      .ok_or(RecordingError::NoData)?;
    let last_end_time = recordings
      .iter()
      .filter_map(|(_, recs)| {
        recs
          .last()
          .map(|last_rec| last_rec.start + samples_to_duration(last_rec.data.len()))
      })
      .max()
      .ok_or(RecordingError::NoData)?;
    debug!(
      ?first_start_time,
      ?last_end_time,
      "Extracted start and end time"
    );

    let folder = Path::new(RECORDINGS_FOLDER).join(format!(
      "{}",
      SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs()
    ));
    fs::create_dir(&folder).await?;

    let mut tasks = Vec::new();
    for (uid, rec) in recordings.into_iter() {
      tasks.push(tokio::spawn(Recorder::save_single_recording(
        cache_and_http.clone(),
        guild_id,
        uid,
        rec,
        folder.clone(),
        first_start_time,
        last_end_time,
      )));
    }

    for join_handle in tasks {
      join_handle
        .await
        .map_err(|err| std::io::Error::from(err))??;
    }

    Ok(())
  }

  #[instrument(skip(cache_and_http, rec, folder))]
  async fn save_single_recording(
    cache_and_http: CacheHttp,
    guild_id: GuildId,
    user_id: UserId,
    mut rec: Vec<VoiceRecording>,
    folder: PathBuf,
    first_start_time: SystemTime,
    last_end_time: SystemTime,
  ) -> Result<(), RecordingError> {
    // Add a last empty recording at last_end_time to ensure everything ends at same timepoint
    rec.push(VoiceRecording {
      start: last_end_time,
      data: Vec::new(),
    });

    // Assemble all the vectors into one big vector respecting gaps
    let mut data = Vec::new();
    let mut previous_end = first_start_time;

    for mut r in rec.into_iter() {
      // Fill in possible gap
      let diff = r
        .start
        .duration_since(previous_end)
        .unwrap()
        .as_nanos()
        .max(0);
      trace!(?diff, ?previous_end, ?r.start, "Filling in gap");
      let missing_samples = nanos_to_samples(diff);
      data.append(&mut vec![0; missing_samples]);

      // Update previous_end before mutating r
      previous_end = r.start + samples_to_duration(r.data.len());
      data.append(&mut r.data);
    }
    debug!("Extracted {} samples", data.len());

    let UserId(uid) = user_id;
    let name = guild_id
      .member(cache_and_http, uid)
      .await
      .map(|member| member.user.name)
      .unwrap_or(uid.to_string());

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
      .args(&args)
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

struct RecorderHandler {
  recorder: Arc<Recorder>,
  guild_id: GuildId,
}

#[async_trait]
impl VoiceEventHandler for RecorderHandler {
  #[instrument(skip(self, ctx))]
  async fn act(&self, ctx: &EventContext<'_>) -> Option<Event> {
    use EventContext as Ctx;
    match ctx {
      Ctx::SpeakingStateUpdate(Speaking { ssrc, user_id, .. }) => {
        // Discord voice calls use RTP, where every sender uses a randomly allocated
        // *Synchronisation Source* (SSRC) to allow receivers to tell which audio
        // stream a received packet belongs to. As this number is not derived from
        // the sender's user_id, only Discord Voice Gateway messages like this one
        // inform us about which random SSRC a user has been allocated. Future voice
        // packets will contain *only* the SSRC.
        //
        // You can implement logic here so that you can differentiate users'
        // SSRCs and map the SSRC to the User ID and maintain this state.
        // Using this map, you can map the `ssrc` in `voice_packet`
        // to the user ID and handle their audio packets separately.
        debug!(
          "Speaking state update: user {:?} has SSRC {:?}",
          user_id, ssrc,
        );

        if let Some(user_id) = user_id {
          let overwritten_user;
          {
            let mut users = self.recorder.users.write().await;
            overwritten_user = users.insert(
              *ssrc,
              UserData {
                guild_id: self.guild_id,
                user_id: user_id.clone(),
                last_voice_activity: SystemTime::now(),
              },
            );
          }

          // Delete the user if no voice activity in the last hour
          if overwritten_user.is_none() {
            let recorder = self.recorder.clone();
            let ssrc = ssrc.clone();
            let span = span!(Level::INFO, "user_gc");
            tokio::spawn(
              async move {
                loop {
                  sleep(Duration::from_secs(60 * 60 * 2)).await;
                  let delete;

                  {
                    let users = recorder.users.read().await;
                    if let Some(user) = users.get(&ssrc) {
                      delete = SystemTime::now()
                        .duration_since(user.last_voice_activity)
                        .unwrap()
                        > Duration::from_secs(60 * 60);
                    } else {
                      break;
                    }
                  }

                  debug!(delete, ssrc, "Checking time out of user data");
                  if delete {
                    let mut users = recorder.users.write().await;
                    users.remove(&ssrc);
                    debug!("{} remaining known users", users.len());
                    break;
                  }
                }
              }
              .instrument(span),
            );
          }
        }
      }
      Ctx::SpeakingUpdate { ssrc, speaking } => {
        // You can implement logic here which reacts to a user starting
        // or stopping speaking.
        trace!(
          "Source {} has {} speaking.",
          ssrc,
          if *speaking { "started" } else { "stopped" },
        );

        if *speaking {
          // Add a new active recording
          {
            let mut active = self.recorder.active.write().await;
            active.entry(*ssrc).or_insert_with(|| VoiceRecording::new());
          }

          let mut users = self.recorder.users.write().await;
          users
            .entry(*ssrc)
            .and_modify(|user| user.last_voice_activity = SystemTime::now());
        } else {
          // Move the active recording to the archive
          let recording;
          {
            let mut active = self.recorder.active.write().await;
            recording = active.remove(ssrc);
          }

          if let Some(recording) = recording {
            let start_time = recording.start;

            {
              let mut archive = self.recorder.archive.write().await;
              let archive_entry = archive.entry(*ssrc).or_insert_with(|| Default::default());
              archive_entry.insert(start_time, recording);
            }

            // Automatically remove the key after 60 secs
            let recorder = self.recorder.clone();
            let ssrc = ssrc.clone();
            let span = span!(Level::INFO, "recording_gc");
            tokio::spawn(
              async move {
                sleep(Duration::from_secs(*RECORDING_LENGTH)).await;
                let mut archive = recorder.archive.write().await;
                if let Some(entry) = archive.get_mut(&ssrc) {
                  entry.remove(&start_time);
                  debug!(
                    ssrc,
                    "Removed timed out recording, {} recordings remaining",
                    entry.len()
                  );

                  if entry.is_empty() {
                    archive.remove(&ssrc);
                    debug!(
                      ssrc,
                      "Removing archive entry, {} entries remaining",
                      archive.len()
                    );
                  }
                }
              }
              .instrument(span),
            );
          }
        }
      }
      Ctx::VoicePacket { audio, packet, .. } => {
        // An event which fires for every received audio packet,
        // containing the decoded data.
        if let Some(audio) = audio {
          trace!(
            "Audio packet sequence {:05} has {:04} bytes (decompressed from {}), SSRC {}",
            packet.sequence.0,
            audio.len() * std::mem::size_of::<i16>(),
            packet.payload.len(),
            packet.ssrc,
          );

          let mut active = self.recorder.active.write().await;
          active
            .entry(packet.ssrc)
            .and_modify(|active_entry| active_entry.data.extend(audio));
        } else {
          error!("RTP packet, but no audio. Driver may not be configured to decode.");
        }
      }
      Ctx::ClientConnect(ClientConnect {
        audio_ssrc,
        video_ssrc,
        user_id,
        ..
      }) => {
        // You can implement your own logic here to handle a user who has joined the
        // voice channel e.g., allocate structures, map their SSRC to User ID.

        debug!(
          "Client connected: user {:?} has audio SSRC {:?}, video SSRC {:?}",
          user_id, audio_ssrc, video_ssrc,
        );
      }
      Ctx::ClientDisconnect(ClientDisconnect { user_id, .. }) => {
        // You can implement your own logic here to handle a user who has left the
        // voice channel e.g., finalise processing of statistics etc.
        // You will typically need to map the User ID to their SSRC; observed when
        // speaking or connecting.

        debug!("Client disconnected: user {:?}", user_id);
      }
      _ => {
        // We won't be registering this struct for any more event classes.
        unimplemented!()
      }
    }

    None
  }
}

impl RecorderHandler {
  pub fn new(recorder: Arc<Recorder>, guild_id: GuildId) -> Self {
    Self { recorder, guild_id }
  }
}

/// Helper trait to add installation/creation methods to serenity's
/// `ClientBuilder`.
pub trait RecorderInit {
  fn register_recorder(self, recorder: Arc<Recorder>) -> Self;
}

impl RecorderInit for ClientBuilder<'_> {
  fn register_recorder(self, recorder: Arc<Recorder>) -> Self {
    self.type_map_insert::<RecorderKey>(recorder)
  }
}

/// Retrieve the Recorder State from a serenity context's
/// shared key-value store.
pub async fn get(ctx: &Context) -> Option<Arc<Recorder>> {
  let data = ctx.data.read().await;

  data.get::<RecorderKey>().cloned()
}

/// Register the recorder as event handler
pub async fn register_recorder(
  recorder: Arc<Recorder>,
  guild_id: GuildId,
  call_lock: Arc<Mutex<Call>>,
) {
  let mut call = call_lock.lock().await;
  call.add_global_event(
    CoreEvent::SpeakingStateUpdate.into(),
    RecorderHandler::new(recorder.clone(), guild_id),
  );
  call.add_global_event(
    CoreEvent::SpeakingUpdate.into(),
    RecorderHandler::new(recorder.clone(), guild_id),
  );
  call.add_global_event(
    CoreEvent::VoicePacket.into(),
    RecorderHandler::new(recorder.clone(), guild_id),
  );
  call.add_global_event(
    CoreEvent::ClientConnect.into(),
    RecorderHandler::new(recorder.clone(), guild_id),
  );
  call.add_global_event(
    CoreEvent::ClientDisconnect.into(),
    RecorderHandler::new(recorder.clone(), guild_id),
  );
}
