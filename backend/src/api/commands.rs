use crate::api::auth::TokenUserId;
use crate::api::EventBus;
use crate::db::models;
use crate::db::DbConn;
use crate::discord::client::Client;
use crate::discord::client::ClientError;
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
use rocket::http::Status;
use rocket::response::{self, Responder, Response};
use rocket::Request;
use rocket::Route;
use rocket::State;
use serenity::model::id::GuildId;
use thiserror::Error;

pub fn get_routes() -> Vec<Route> {
    routes![join, leave, stop, play, record]
}

#[derive(Debug, Error)]
enum CommandError {
    #[error("Not a member: you must be a member of the guild to perform this task")]
    NotAMember(#[from] PermissionError),

    #[error("Failed to stop playback: {0}")]
    StopPlaybackError(#[from] ClientError),

    #[error("Recording error: {0}")]
    RecordingError(#[from] RecordingError),

    #[error("Database error: {0}")]
    DieselError(#[from] DieselError),

    #[error("Number handling error")]
    BigDecimalError,
}

impl CommandError {
    fn status_code(&self) -> Status {
        match self {
            Self::NotAMember(_) => Status::Forbidden,
            Self::StopPlaybackError(_) => Status::InternalServerError,
            Self::RecordingError(_) => Status::InternalServerError,
            Self::DieselError(_) => Status::InternalServerError,
            Self::BigDecimalError => Status::InternalServerError,
        }
    }
}

impl<'r> Responder<'r, 'static> for CommandError {
    fn respond_to(self, req: &'r Request<'_>) -> response::Result<'static> {
        let status = self.status_code();
        let error_message = self.to_string();

        Response::build_from(error_message.respond_to(req)?)
            .status(status)
            .ok()
    }
}

#[post("/<guild_id>/join")]
async fn join(
    guild_id: u64,
    client: &State<Client>,
    cache_http: &State<CacheHttp>,
    event_bus: &State<EventBus>,
    db: DbConn,
    user: TokenUserId,
) -> Result<String, CommandError> {
    let guild_id = GuildId::new(guild_id);
    let permission = check_guild_user(cache_http.inner(), &db, user.into(), guild_id).await?;

    let (channel_id, _) = client.join_user(guild_id, user.into(), cache_http).await?;
    event_bus.channel_joined(
        &permission.member,
        channel_id
            .name(cache_http.inner())
            .await
            .unwrap_or_else(|_| String::from("")),
    );

    Ok(String::from("Joined channel"))
}

#[post("/<guild_id>/leave")]
async fn leave(
    guild_id: u64,
    client: &State<Client>,
    cache_http: &State<CacheHttp>,
    event_bus: &State<EventBus>,
    db: DbConn,
    user: TokenUserId,
) -> Result<String, CommandError> {
    let guild_id = GuildId::new(guild_id);
    let permission = check_guild_user(cache_http.inner(), &db, user.into(), guild_id).await?;

    client.leave(guild_id).await?;
    event_bus.channel_left(&permission.member);

    Ok(String::from("Left channel"))
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
    let guild_id = GuildId::new(guild_id);
    let permission = check_guild_user(cache_http.inner(), &db, user.into(), guild_id).await?;

    client.stop(guild_id).await?;
    event_bus.inner().playback_stopped(&permission.member);

    Ok(String::from("Stopped playback"))
}

#[allow(clippy::too_many_arguments)]
#[post("/<guild_id>/play/<sound_id>?<autojoin>")]
async fn play(
    guild_id: u64,
    sound_id: i32,
    autojoin: bool,
    client: &State<Client>,
    cache_http: &State<CacheHttp>,
    event_bus: &State<EventBus>,
    db: DbConn,
    user: TokenUserId,
) -> Result<(), CommandError> {
    // Check permission to play on this guild
    let serenity_user = user.into();
    let permission = check_guild_user(
        cache_http.inner(),
        &db,
        serenity_user,
        GuildId::new(guild_id),
    )
    .await?;

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
        .ok_or_else(|| CommandError::BigDecimalError)?;
    check_guild_user(
        cache_http.inner(),
        &db,
        serenity_user,
        GuildId::new(sound_gid),
    )
    .await?;

    let gid = BigDecimal::from_u64(guild_id).ok_or_else(|| CommandError::BigDecimalError)?;
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

    if autojoin {
        client
            .join_user(GuildId::new(guild_id), user.into(), cache_http.inner())
            .await?;
    }

    client
        .play(
            &file_handling::get_full_sound_path(&soundfile.file_name),
            adjustment,
            GuildId::new(guild_id),
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
    let guild_id = GuildId::new(guild_id);
    let permission = check_guild_user(cache_http.inner(), &db, user.into(), guild_id).await?;

    client
        .recorder
        .save_recording(guild_id, cache_http.inner())
        .await?;

    event_bus.inner().recording_saved(&permission.member);
    Ok(String::from("Recording saved"))
}
