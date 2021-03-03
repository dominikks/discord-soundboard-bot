use crate::discord::recorder::Recorder;
use crate::discord::CacheHttp;
use serenity::model::channel::ChannelType;
use serenity::model::id::ChannelId;
use serenity::model::id::GuildId;
use songbird::Songbird;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug)]
pub enum PlayError {
  FailedToJoinChannel,
  Decoding(songbird::input::error::Error),
}

#[instrument(skip(songbird, recorder))]
pub async fn join_channel(
  guild_id: GuildId,
  channel_id: ChannelId,
  songbird: Arc<Songbird>,
  recorder: Arc<Recorder>,
) -> Result<Arc<Mutex<songbird::Call>>, ()> {
  let (call_lock, result) = songbird.join(guild_id, channel_id).await;
  result.map_err(|_| ())?;

  recorder
    .register_with_call(guild_id, call_lock.clone())
    .await;

  Ok(call_lock)
}

#[instrument(skip(songbird, recorder, cache_and_http))]
pub async fn play(
  sound_path: &PathBuf,
  volume_adjustment: f32,
  guild_id: GuildId,
  songbird: Arc<Songbird>,
  recorder: Arc<Recorder>,
  cache_and_http: &CacheHttp,
) -> Result<(), PlayError> {
  let handler_lock = match songbird.get(guild_id) {
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
      join_channel(guild_id, *channel_id, songbird, recorder)
        .await
        .map_err(|_| PlayError::FailedToJoinChannel)?
    }
  };
  let mut handler = handler_lock.lock().await;

  let volume_adjustment_string = format!("volume={}dB", volume_adjustment);
  let source = match songbird::input::ffmpeg_optioned(
    sound_path,
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
  Ok(())
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
