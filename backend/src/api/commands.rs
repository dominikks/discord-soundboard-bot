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
use rocket::response::Responder;
use rocket::Route;
use rocket::State;
use serenity::model::id::GuildId;

pub fn get_routes() -> Vec<Route> {
    routes![join, leave, stop, play, record]
}

#[derive(Debug, Responder)]
enum CommandError {
    #[response(status = 404)]
    NotFound(String),
    #[response(status = 503)]
    ServiceUnavailable(String),
    #[response(status = 403)]
    NotAMember(String),
    #[response(status = 400)]
    NotInAVoiceChannel(String),
    #[response(status = 500)]
    InternalError(String),
}

impl CommandError {
    fn bigdecimal_error() -> Self {
        Self::InternalError(String::from("Number handling error"))
    }
}

impl From<ClientError> for CommandError {
    fn from(error: ClientError) -> Self {
        error!(?error, "Error in discord client");
        match error {
            ClientError::GuildNotFound => CommandError::InternalError(String::from(
                "Failed to find guild in cache. The internal cache might be corrupted.",
            )),
            ClientError::UserNotFound => CommandError::NotInAVoiceChannel(String::from(
                "User is not in a (visible) voice channel in this guild",
            )),
            ClientError::NotInAChannel => {
                CommandError::ServiceUnavailable(String::from("Bot is not in a voice channel"))
            }
            ClientError::ConnectionError => {
                CommandError::InternalError(String::from("Error communicating with Discord API"))
            }
            ClientError::DecodingError(_) => CommandError::InternalError(String::from(
                "Error decoding soundfile, the file might be corrupted.",
            )),
        }
    }
}

impl From<RecordingError> for CommandError {
    fn from(error: RecordingError) -> Self {
        error!(?error, "Error in discord recorder");
        match error {
            RecordingError::IoError(err) => {
                Self::InternalError(format!("Internal I/O error: {}", err))
            }
            RecordingError::NoData => Self::NotFound(String::from("No data available to record")),
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

#[post("/<guild_id>/join")]
async fn join(
    guild_id: u64,
    client: &State<Client>,
    cache_http: &State<CacheHttp>,
    event_bus: &State<EventBus>,
    db: DbConn,
    user: TokenUserId,
) -> Result<String, CommandError> {
    let guild_id = GuildId(guild_id);
    let permission = check_guild_user(cache_http.inner(), &db, user.into(), guild_id).await?;

    let (channel_id, _) = client.join_user(guild_id, user.into(), cache_http).await?;
    event_bus.channel_joined(
        &permission.member,
        channel_id
            .name(cache_http.inner())
            .await
            .unwrap_or_else(|| String::from("")),
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
    let guild_id = GuildId(guild_id);
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
    let guild_id = GuildId(guild_id);
    let permission = check_guild_user(cache_http.inner(), &db, user.into(), guild_id).await?;

    client
        .stop(guild_id)
        .await
        .map_err(|_| CommandError::InternalError(String::from("Failed to stop the playback")))?;
    event_bus.inner().playback_stopped(&permission.member);

    Ok(String::from("Stopped playback"))
}

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
    let permission =
        check_guild_user(cache_http.inner(), &db, serenity_user, GuildId(guild_id)).await?;

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
        .ok_or_else(CommandError::bigdecimal_error)?;
    check_guild_user(cache_http.inner(), &db, serenity_user, GuildId(sound_gid)).await?;

    let gid = BigDecimal::from_u64(guild_id).ok_or_else(CommandError::bigdecimal_error)?;
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
            .join_user(GuildId(guild_id), user.into(), cache_http.inner())
            .await?;
    }

    client
        .play(
            &file_handling::get_full_sound_path(&soundfile.file_name),
            adjustment,
            GuildId(guild_id),
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
    let permission = check_guild_user(cache_http.inner(), &db, user.into(), guild_id).await?;

    client
        .recorder
        .save_recording(guild_id, cache_http.inner())
        .await?;

    event_bus.inner().recording_saved(&permission.member);
    Ok(String::from("Recording saved"))
}
