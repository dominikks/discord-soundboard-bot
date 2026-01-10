use crate::discord::recorder::Recorder;
use crate::discord::CacheHttp;
use serenity::client::ClientBuilder;
use serenity::client::Context;
use serenity::model::id::ChannelId;
use serenity::model::id::GuildId;
use serenity::model::id::UserId;
use serenity::prelude::TypeMapKey;
use songbird::driver::DecodeMode;
use songbird::error::JoinError;
use songbird::Config as DriverConfig;
use songbird::SerenityInit;
use songbird::Songbird;
use std::path::Path;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::Mutex;

#[derive(Debug, Error)]
pub enum ClientError {
    #[error("Bot is not in a voice channel")]
    NotInAChannel,
    #[error("User not found in a voice channel")]
    UserNotFound,
    #[error("Error decoding audio: {0}")]
    DecodingError(String),
    #[error("Connection error")]
    ConnectionError,
    #[error("Guild not found")]
    GuildNotFound,
}

#[derive(Clone)]
pub struct Client {
    songbird: Arc<Songbird>,
    pub recorder: Arc<Recorder>,
}

impl Default for Client {
    fn default() -> Self {
        Self::new()
    }
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
    ) -> Result<Arc<Mutex<songbird::Call>>, ClientError> {
        let call_lock = self
            .songbird
            .join(guild_id, channel_id)
            .await
            .map_err(|_| ClientError::ConnectionError)?;

        self.recorder
            .register_with_call(guild_id, call_lock.clone())
            .await;

        Ok(call_lock)
    }

    #[instrument(skip(self, cache_and_http))]
    pub async fn join_user(
        &self,
        guild_id: GuildId,
        user_id: UserId,
        cache_and_http: &CacheHttp,
    ) -> Result<(ChannelId, Arc<Mutex<songbird::Call>>), ClientError> {
        let channel_id = {
            let guild = guild_id
                .to_guild_cached(cache_and_http)
                .ok_or(ClientError::GuildNotFound)?;

            guild
                .voice_states
                .get(&user_id)
                .and_then(|voice_state| voice_state.channel_id)
                .ok_or(ClientError::UserNotFound)?
        };

        debug!(?channel_id, "Joining user in channel");

        self.join_channel(guild_id, channel_id)
            .await
            .map(|call| (channel_id, call))
    }

    #[instrument(skip(self))]
    pub async fn leave(&self, guild_id: GuildId) -> Result<(), ClientError> {
        self.songbird
            .remove(guild_id)
            .await
            .map_err(|err| match err {
                JoinError::NoCall => ClientError::NotInAChannel,
                _ => ClientError::ConnectionError,
            })
    }

    #[instrument(skip(self, sound_path))]
    pub async fn play(
        &self,
        sound_path: impl AsRef<Path>,
        volume_adjustment: f32,
        guild_id: GuildId,
    ) -> Result<(), ClientError> {
        let call_lock = self
            .songbird
            .get(guild_id)
            .ok_or(ClientError::NotInAChannel)?;
        let mut call = call_lock.lock().await;

        // Use File input which internally uses ffmpeg
        use songbird::input::File;

        let source = File::new(sound_path.as_ref().to_path_buf());

        // Play the source
        let handle = call.play(source.into());

        // Convert dB to linear scale for volume adjustment
        // Formula: linear = 10^(dB/20)
        let linear_volume = 10f32.powf(volume_adjustment / 20.0);
        if let Err(e) = handle.set_volume(linear_volume) {
            warn!("Failed to set volume to {}: {:?}", linear_volume, e);
        }

        Ok(())
    }

    #[instrument(skip(self))]
    pub async fn stop(&self, guild_id: GuildId) -> Result<(), ClientError> {
        let handler_lock = self
            .songbird
            .get(guild_id)
            .ok_or(ClientError::NotInAChannel)?;

        let mut handler = handler_lock.lock().await;
        handler.stop();

        Ok(())
    }
}

/// Helper trait to add installation/creation methods to serenity's
/// `ClientBuilder`.
pub trait ClientInit {
    fn register_client(self, client: &Client) -> Self;
}

impl ClientInit for ClientBuilder {
    fn register_client(self, client: &Client) -> Self {
        self.type_map_insert::<ClientKey>(client.clone())
            .register_songbird_with(client.songbird.clone())
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
