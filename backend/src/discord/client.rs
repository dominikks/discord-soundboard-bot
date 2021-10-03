use crate::discord::recorder::Recorder;
use crate::discord::CacheHttp;
use serenity::client::ClientBuilder;
use serenity::client::Context;
use serenity::model::channel::ChannelType;
use serenity::model::id::ChannelId;
use serenity::model::id::GuildId;
use serenity::prelude::TypeMapKey;
use songbird::driver::DecodeMode;
use songbird::Config as DriverConfig;
use songbird::SerenityInit;
use songbird::Songbird;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug)]
pub enum PlayError {
  FailedToJoinChannel,
  Decoding(songbird::input::error::Error),
}

#[derive(Clone)]
pub struct Client {
  songbird: Arc<Songbird>,
  pub recorder: Arc<Recorder>,
}

impl Client {
  #[instrument]
  pub fn new() -> Self {
    let songbird = Songbird::serenity();
    songbird.set_config(DriverConfig::default().decode_mode(DecodeMode::Decode));

    Self {
      songbird,
      recorder: Recorder::create(),
    }
  }

  #[instrument(skip(self))]
  pub async fn join_channel(
    &self,
    guild_id: GuildId,
    channel_id: ChannelId,
  ) -> Result<Arc<Mutex<songbird::Call>>, ()> {
    let (call_lock, result) = self.songbird.join(guild_id, channel_id).await;
    result.map_err(|_| ())?;

    self
      .recorder
      .register_with_call(guild_id, call_lock.clone())
      .await;

    Ok(call_lock)
  }

  #[instrument(skip(self, cache_and_http))]
  pub async fn play(
    &self,
    sound_path: &PathBuf,
    volume_adjustment: f32,
    guild_id: GuildId,
    cache_and_http: &CacheHttp,
  ) -> Result<(), PlayError> {
    let handler_lock = match self.songbird.get(guild_id) {
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
        self
          .join_channel(guild_id, *channel_id)
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

  #[instrument(skip(self))]
  pub async fn stop(&self, guild_id: GuildId) -> bool {
    if let Some(handler_lock) = self.songbird.get(guild_id) {
      let mut handler = handler_lock.lock().await;
      handler.stop();
      true
    } else {
      false
    }
  }
}

/// Helper trait to add installation/creation methods to serenity's
/// `ClientBuilder`.
pub trait ClientInit {
  fn register_client(self, client: &Client) -> Self;
}

impl ClientInit for ClientBuilder<'_> {
  fn register_client(self, client: &Client) -> Self {
    self
      .type_map_insert::<ClientKey>(client.clone())
      .register_songbird_with(client.songbird.clone().into())
  }
}

/// Key used to put the Client into the serenity TypeMap
struct ClientKey;

impl TypeMapKey for ClientKey {
  type Value = Client;
}

/// Retrieve the Client State from a serenity context's
/// shared key-value store.
pub async fn get(ctx: &Context) -> Option<Client> {
  let data = ctx.data.read().await;

  data.get::<ClientKey>().cloned()
}
