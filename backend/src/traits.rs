/// Trait abstractions for testing Discord integration
/// These traits allow us to mock Discord functionality in tests while keeping
/// the production code unchanged.

use crate::audio_utils::VolumeInformation;
use async_trait::async_trait;
use serenity::model::guild::{Guild, Member};
use serenity::model::id::{ChannelId, GuildId, UserId};
use songbird::error::JoinError;
use songbird::Call;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Trait for voice client operations (join, play, stop)
#[async_trait]
#[allow(dead_code)]
pub trait VoiceClient: Send + Sync {
    async fn join_channel(
        &self,
        guild_id: GuildId,
        channel_id: ChannelId,
    ) -> Result<Arc<Mutex<Call>>, JoinError>;

    async fn play(
        &self,
        sound_path: &Path,
        volume_adjustment: f32,
        guild_id: GuildId,
    ) -> Result<(), String>;

    async fn stop(&self, guild_id: GuildId) -> Result<(), String>;

    async fn leave(&self, guild_id: GuildId) -> Result<(), String>;
}

/// Trait for audio analysis operations (volume detection, length extraction)
#[async_trait]
#[allow(dead_code)]
pub trait AudioAnalyzer: Send + Sync {
    async fn detect_volume(&self, path: &Path) -> Option<VolumeInformation>;
    async fn get_length(&self, path: &Path) -> Option<f32>;
}

/// Trait for Discord API operations (member/guild lookups)
#[async_trait]
#[allow(dead_code)]
pub trait DiscordApi: Send + Sync {
    async fn get_member(&self, guild_id: GuildId, user_id: UserId) -> Result<Member, String>;
    async fn get_guild(&self, guild_id: GuildId) -> Result<Guild, String>;
}
