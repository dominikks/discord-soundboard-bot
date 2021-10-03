use crate::api::auth::TokenUserId;
use crate::api::utils::AvatarOrDefault;
use crate::api::Snowflake;
use crate::db::models::Sound;
use crate::db::DbConn;
use crate::discord::management::check_guild_user;
use crate::CacheHttp;
use rocket::http::Status;
use rocket::response::stream::Event;
use rocket::response::stream::EventStream;
use rocket::Route;
use rocket::Shutdown;
use rocket::State;
use serde::Deserialize;
use serde::Serialize;
use serenity::model::guild::Member;
use serenity::model::id::GuildId;
use tokio::select;
use tokio::sync::broadcast::channel;
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::broadcast::Receiver;
use tokio::sync::broadcast::Sender;

pub fn get_routes() -> Vec<Route> {
  routes![events]
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PlaybackStartedData {
  #[serde(flatten)]
  target_data: EventData,
  sound_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EventData {
  guild_id: Snowflake,
  user_name: String,
  user_avatar_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
enum EventMessage {
  PlaybackStarted(PlaybackStartedData),
  PlaybackStopped(EventData),
  RecordingSaved(EventData),
}

pub struct EventBus {
  sender: Sender<(GuildId, EventMessage)>,
}

impl EventBus {
  pub fn new() -> Self {
    Self {
      sender: channel::<(GuildId, EventMessage)>(1024).0,
    }
  }

  pub fn playback_started(&self, member: &Member, sound: &Sound) {
    // If sending the event fails, we ignore it
    let _ = self.sender.send((
      member.guild_id,
      EventMessage::PlaybackStarted(PlaybackStartedData {
        target_data: member.into(),
        sound_name: sound.name.clone(),
      }),
    ));
  }

  pub fn playback_stopped(&self, member: &Member) {
    let _ = self.sender.send((
      member.guild_id,
      EventMessage::PlaybackStopped(member.into()),
    ));
  }

  pub fn recording_saved(&self, member: &Member) {
    let _ = self
      .sender
      .send((member.guild_id, EventMessage::RecordingSaved(member.into())));
  }

  fn subscribe(&self) -> Receiver<(GuildId, EventMessage)> {
    self.sender.subscribe()
  }
}

impl From<&Member> for EventData {
  fn from(member: &Member) -> Self {
    Self {
      guild_id: Snowflake(member.guild_id.0),
      user_name: member.nick.clone().unwrap_or(member.user.name.clone()),
      user_avatar_url: member.avatar_url_or_default(),
    }
  }
}

#[get("/<guild_id>/events")]
async fn events(
  guild_id: u64,
  cache_http: &State<CacheHttp>,
  event_bus: &State<EventBus>,
  db: DbConn,
  user: TokenUserId,
  mut end: Shutdown,
) -> Result<EventStream![], Status> {
  // Only users may get events from this guild
  let serenity_user = user.into();
  check_guild_user(&cache_http.inner(), &db, serenity_user, GuildId(guild_id))
    .await
    .map_err(|_| Status::Forbidden)?;

  let mut rx = event_bus.subscribe();
  Ok(EventStream! {
    loop {
      let (msg_guild, msg) = select! {
        msg = rx.recv() => match msg {
          Ok(msg) => msg,
          Err(RecvError::Closed) => break,
          Err(RecvError::Lagged(_)) => continue,
        },
        _ = &mut end => break,
      };

      if msg_guild.0 == guild_id {
        yield Event::json(&msg);
      }
    }
  })
}
