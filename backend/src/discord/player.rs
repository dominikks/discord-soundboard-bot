use crate::audio_utils::detect_volume;
use crate::audio_utils::VolumeInformation;
use crate::discord::CacheHttp;
use crate::file_handling::Sound;
use crate::file_handling::VolumeAdjustment;
use lazy_static::lazy_static;
use serenity::model::channel::ChannelType;
use serenity::model::id::GuildId;
use songbird::Songbird;
use std::env::var;
use std::sync::Arc;
use tracing::{debug, instrument, trace, warn};

lazy_static! {
  static ref TARGET_MAX_VOLUME: f32 = var("TARGET_MAX_VOLUME")
    .map(|content| content
      .parse::<f32>()
      .expect("Invalid value for TARGET_MAX_VALUE"))
    .unwrap_or(-3.0);
  static ref TARGET_MEAN_VOLUME: f32 = var("TARGET_MEAN_VOLUME")
    .map(|content| content
      .parse::<f32>()
      .expect("Invalid value for TARGET_MEAN_VALUE"))
    .unwrap_or(-10.0);
}

#[derive(Debug)]
pub enum PlayError {
  FailedToJoinChannel,
  AnalysisFailed,
  Decoding(songbird::input::error::Error),
}

#[derive(Debug)]
pub struct PlayResult {
  pub volume: Option<VolumeInformation>,
  pub volume_adjustment: f32,
}

#[instrument(skip(songbird, cache_and_http))]
pub async fn play(
  sound: &Sound,
  guild_id: GuildId,
  songbird: Arc<Songbird>,
  cache_and_http: &CacheHttp,
) -> Result<PlayResult, PlayError> {
  let manager = songbird.clone();
  let handler_lock = match manager.get(guild_id) {
    Some(handler_lock) => handler_lock,
    None => {
      // Try to join the voice channel with the most users in it
      let channels = guild_id
        .channels(&cache_and_http.http)
        .await
        .map_err(|_e| PlayError::FailedToJoinChannel)?;
      let mut candidates = Vec::new();
      for (channel_id, channel) in channels
        .iter()
        .filter(|(_, channel)| channel.kind == ChannelType::Voice)
      {
        if let Ok(number) = channel
          .members(&cache_and_http.cache)
          .await
          .map(|members| members.len())
        {
          candidates.push((*channel_id, number));
        }
      }
      trace!(?candidates, "Trying to auto-join");
      let (channel_id, _) = candidates
        .iter()
        .max_by_key(|(_, number)| number)
        .ok_or(PlayError::FailedToJoinChannel)?;

      debug!(?channel_id, "Auto-joining channel");
      let (handler_lock, result) = manager.join(guild_id, *channel_id).await;
      let _ = result.map_err(|_| PlayError::FailedToJoinChannel)?;

      handler_lock
    }
  };
  let mut handler = handler_lock.lock().await;

  let file_path = sound.get_full_path();
  let (volume, volume_adjustment) = match sound.volume_adjustment {
    VolumeAdjustment::Automatic => {
      // Adjust the max and mean volumes to be at least the specified value
      let volume = detect_volume(file_path.clone())
        .await
        .ok_or(PlayError::AnalysisFailed)?;
      let adjustment = (*TARGET_MAX_VOLUME - volume.max_volume)
        .max(*TARGET_MEAN_VOLUME - volume.mean_volume)
        .max(0.0);
      (Some(volume), adjustment)
    }
    VolumeAdjustment::Manual(adj) => (None, adj),
  };
  debug!(?volume_adjustment, "Adjusting volume of file");
  let volume_adjustment_string = format!("volume={}dB", volume_adjustment);

  let source = match songbird::input::ffmpeg_optioned(
    file_path,
    &[],
    &[
      "-f",
      "s16le",
      "-ar",
      "48000",
      "-acodec",
      "pcm_f32le",
      "-filter:a",
      &volume_adjustment_string,
      "-",
    ],
  )
  .await
  {
    Ok(source) => source,
    Err(why) => {
      warn!("Err starting source: {:?}", why);
      return Err(PlayError::Decoding(why));
    }
  };

  handler.play_only_source(source);
  Ok(PlayResult {
    volume,
    volume_adjustment: volume_adjustment,
  })
}

#[instrument(skip(songbird))]
pub async fn stop(guild_id: GuildId, songbird: Arc<Songbird>) -> bool {
  if let Some(handler_lock) = songbird.get(guild_id) {
    let mut handler = handler_lock.lock().await;
    handler.stop();
    true
  } else {
    false
  }
}
