use crate::api::auth::TokenUserId;
use crate::api::EventBus;
use crate::db::models;
use crate::db::DbConn;
use crate::discord::client::Client;
use crate::discord::client::PlayError as DiscordPlayError;
use crate::discord::management::check_guild_user;
use crate::discord::management::PermissionError;
use crate::discord::recorder::RecordingError;
use crate::discord::CacheHttp;
use crate::file_handling;
use bigdecimal::BigDecimal;
use bigdecimal::FromPrimitive;
use bigdecimal::ToPrimitive;
use diesel::prelude::*;
use diesel::result::Error as DieselError;
use rocket::response::Responder;
use rocket::Route;
use rocket::State;
use serenity::model::id::GuildId;

pub fn get_routes() -> Vec<Route> {
  routes![stop, play, record]
}

#[derive(Debug, Responder)]
enum CommandError {
  #[response(status = 404)]
  NotFound(String),
  #[response(status = 503)]
  ServiceUnavailable(String),
  #[response(status = 403)]
  NotAMember(String),
  #[response(status = 500)]
  InternalError(String),
}

impl CommandError {
  fn bigdecimal_error() -> Self {
    Self::InternalError(String::from("Number handling error"))
  }
}

impl From<DiscordPlayError> for CommandError {
  fn from(error: DiscordPlayError) -> Self {
    match error {
      DiscordPlayError::FailedToJoinChannel => {
        CommandError::ServiceUnavailable(String::from("Unable to join a voice channel"))
      }
      DiscordPlayError::Decoding(_) => CommandError::NotFound(String::from(
        "Error decoding soundfile, the file might be corrupted.",
      )),
    }
  }
}

impl From<PermissionError> for CommandError {
  fn from(_: PermissionError) -> Self {
    Self::NotAMember(String::from(
      "You must be a member of the guild to perform this task",
    ))
  }
}

impl From<DieselError> for CommandError {
  fn from(err: DieselError) -> Self {
    if err == DieselError::NotFound {
      Self::NotFound(String::from("Data not found in database"))
    } else {
      Self::InternalError(String::from("Database error"))
    }
  }
}

#[post("/<guild_id>/stop")]
async fn stop(
  guild_id: u64,
  client: &State<Client>,
  cache_http: &State<CacheHttp>,
  event_bus: &State<EventBus>,
  db: DbConn,
  user: TokenUserId,
) -> Result<String, CommandError> {
  let guild_id = GuildId(guild_id);
  let permission = check_guild_user(&cache_http.inner(), &db, user.into(), guild_id).await?;

  if client.stop(guild_id).await {
    event_bus.inner().playback_stopped(&permission.member);
    Ok(String::from("Stopped playback"))
  } else {
    Err(CommandError::InternalError(String::from(
      "Failed to stop the playback",
    )))
  }
}

#[post("/<guild_id>/play/<sound_id>")]
async fn play(
  guild_id: u64,
  sound_id: i32,
  client: &State<Client>,
  cache_http: &State<CacheHttp>,
  event_bus: &State<EventBus>,
  db: DbConn,
  user: TokenUserId,
) -> Result<(), CommandError> {
  // Check permission to play on this guild
  let serenity_user = user.into();
  let permission =
    check_guild_user(&cache_http.inner(), &db, serenity_user, GuildId(guild_id)).await?;

  let (sound, soundfile) = db
    .run(move |c| {
      use crate::db::schema::soundfiles;
      use crate::db::schema::sounds;

      sounds::table
        .find(sound_id)
        .inner_join(soundfiles::table)
        .first::<(models::Sound, models::Soundfile)>(c)
    })
    .await?;

  // Check permission to play the sound file
  let sound_gid = sound
    .guild_id
    .to_u64()
    .ok_or(CommandError::bigdecimal_error())?;
  check_guild_user(&cache_http.inner(), &db, serenity_user, GuildId(sound_gid)).await?;

  let gid = BigDecimal::from_u64(guild_id).ok_or(CommandError::bigdecimal_error())?;
  let guild_settings = db
    .run(move |c| {
      use crate::db::schema::guildsettings::dsl::*;

      guildsettings
        .find(gid)
        .first::<models::GuildSettings>(c)
        .optional()
    })
    .await?;

  let (target_max_volume, target_mean_volume) = guild_settings
    .map(|guild_settings| {
      (
        guild_settings.target_max_volume,
        guild_settings.target_mean_volume,
      )
    })
    .unwrap_or((0.0, -13.0));

  let adjustment = sound.volume_adjustment.unwrap_or_else(|| {
    (target_max_volume - soundfile.max_volume)
      .max(target_mean_volume - soundfile.mean_volume)
      .max(0.0)
  });

  client
    .play(
      &file_handling::get_full_sound_path(&soundfile.file_name),
      adjustment,
      GuildId(guild_id),
      cache_http.inner(),
    )
    .await?;

  event_bus
    .inner()
    .playback_started(&permission.member, &sound);

  Ok(())
}

#[instrument(skip(client, cache_http, event_bus, db, user))]
#[post("/<guild_id>/record")]
async fn record(
  guild_id: u64,
  client: &State<Client>,
  cache_http: &State<CacheHttp>,
  event_bus: &State<EventBus>,
  db: DbConn,
  user: TokenUserId,
) -> Result<String, CommandError> {
  let guild_id = GuildId(guild_id);
  let permission = check_guild_user(&cache_http.inner(), &db, user.into(), guild_id).await?;

  match client
    .recorder
    .save_recording(guild_id, &cache_http.inner())
    .await
  {
    Ok(_) => {
      event_bus.inner().recording_saved(&permission.member);
      Ok(String::from("Recording saved"))
    }
    Err(err) => {
      error!(?err, "Failed to record");
      match err {
        RecordingError::IoError(err) => Err(CommandError::InternalError(format!(
          "Internal I/O error: {}",
          err
        ))),
        RecordingError::NoData => Err(CommandError::NotFound(String::from(
          "No data available to record",
        ))),
      }
    }
  }
}
