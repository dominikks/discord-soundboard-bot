use std::convert::TryFrom;
use std::num::TryFromIntError;
use std::path::PathBuf;
use std::time::SystemTime;

use bigdecimal::BigDecimal;
use bigdecimal::FromPrimitive;
use bigdecimal::ToPrimitive;
use diesel::prelude::*;
use diesel::result::Error as DieselError;
use rocket::fs::NamedFile;
use rocket::fs::TempFile;
use rocket::http::Status;
use rocket::response::{self, Responder, Response};
use rocket::routes;
use rocket::serde::json::Json;
use rocket::Request;
use rocket::Route;
use rocket::State;
use serde::Deserialize;
use serde::Serialize;
use serde_with::serde_as;
use serde_with::TimestampSeconds;
use serenity::model::id::GuildId;
use thiserror::Error;
use tokio::fs;

use crate::api::auth::TokenUserId;
use crate::api::auth::UserId;
use crate::api::Snowflake;
use crate::audio_utils;
use crate::db::models;
use crate::db::DbConn;
use crate::discord::management::check_guild_moderator;
use crate::discord::management::check_guild_user;
use crate::discord::management::get_guilds_for_user;
use crate::discord::management::PermissionError;
use crate::file_handling;
use crate::CacheHttp;

pub fn get_routes() -> Vec<Route> {
    routes![
        list_sounds,
        get_sound,
        create_sound,
        update_sound,
        delete_sound,
        upload_sound
    ]
}

#[derive(Debug, Error)]
enum SoundsError {
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    
    #[error("Discord API error: {0}")]
    SerenityError(#[from] serenity::Error),
    
    #[error("Internal error: {0}")]
    InternalError(String),
    
    #[error("Database error: {0}")]
    DieselError(DieselError),
    
    #[error("Insufficient permissions: you do not have the permission to perform this action")]
    InsufficientPermission(#[from] PermissionError),
    
    #[error("Not found: {0}")]
    NotFound(String),
    
    #[error("Invalid sound file: {0}")]
    InvalidSoundfile(String),
    
    #[error("Number conversion error: {0}")]
    NumberConversion(#[from] TryFromIntError),
    
    #[error("Number handling error")]
    BigDecimalError,
}

impl From<DieselError> for SoundsError {
    fn from(err: DieselError) -> Self {
        if err == DieselError::NotFound {
            Self::NotFound(String::from("A sound with the given id does not exist"))
        } else {
            Self::DieselError(err)
        }
    }
}

impl SoundsError {
    fn bigdecimal_error() -> Self {
        Self::BigDecimalError
    }
    
    fn status_code(&self) -> Status {
        match self {
            Self::IoError(_) => Status::InternalServerError,
            Self::SerenityError(_) => Status::InternalServerError,
            Self::InternalError(_) => Status::InternalServerError,
            Self::DieselError(_) => Status::InternalServerError,
            Self::InsufficientPermission(_) => Status::Forbidden,
            Self::NotFound(_) => Status::NotFound,
            Self::InvalidSoundfile(_) => Status::BadRequest,
            Self::NumberConversion(_) => Status::InternalServerError,
            Self::BigDecimalError => Status::InternalServerError,
        }
    }
}

impl<'r> Responder<'r, 'static> for SoundsError {
    fn respond_to(self, req: &'r Request<'_>) -> response::Result<'static> {
        let status = self.status_code();
        let error_message = self.to_string();
        
        Response::build_from(error_message.respond_to(req)?)
            .status(status)
            .ok()
    }
}

#[serde_as]
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct Sound {
    id: Snowflake,
    guild_id: Snowflake,
    name: String,
    category: String,
    #[serde_as(as = "TimestampSeconds<String>")]
    created_at: SystemTime,
    volume_adjustment: Option<f32>,
    sound_file: Option<Soundfile>,
}

#[serde_as]
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct Soundfile {
    max_volume: f32,
    mean_volume: f32,
    length: f32,
    #[serde_as(as = "TimestampSeconds<String>")]
    uploaded_at: SystemTime,
}

impl TryFrom<(models::Sound, Option<models::Soundfile>)> for Sound {
    type Error = SoundsError;

    fn try_from(input: (models::Sound, Option<models::Soundfile>)) -> Result<Self, Self::Error> {
        let (s, f) = input;
        Ok(Self {
            id: Snowflake(u64::try_from(s.id)?),
            guild_id: Snowflake(
                s.guild_id
                    .to_u64()
                    .ok_or_else(SoundsError::bigdecimal_error)?,
            ),
            name: s.name,
            category: s.category,
            created_at: s.created_at,
            volume_adjustment: s.volume_adjustment,
            sound_file: f.map(|f| Soundfile {
                max_volume: f.max_volume,
                mean_volume: f.mean_volume,
                length: f.length,
                uploaded_at: f.uploaded_at,
            }),
        })
    }
}

#[get("/")]
async fn list_sounds(
    cache_http: &State<CacheHttp>,
    db: DbConn,
    user: TokenUserId,
) -> Result<Json<Vec<Sound>>, SoundsError> {
    let guild_ids = get_guilds_for_user(cache_http.inner(), &db, user.into())
        .await?
        .into_iter()
        .map(|(guildinfo, _)| {
            BigDecimal::from_u64(guildinfo.id.0).ok_or_else(SoundsError::bigdecimal_error)
        })
        .collect::<Result<Vec<_>, _>>()?;

    let sounds = db
        .run(move |c| {
            use crate::db::schema::soundfiles;
            use crate::db::schema::sounds;

            sounds::table
                .filter(sounds::guild_id.eq_any(guild_ids))
                .left_join(soundfiles::table)
                .load::<(models::Sound, Option<models::Soundfile>)>(c)
        })
        .await?;

    Ok(Json(
        sounds
            .into_iter()
            .map(Sound::try_from)
            .collect::<Result<Vec<_>, _>>()?,
    ))
}

#[get("/<sound_id>")]
async fn get_sound(
    sound_id: i32,
    cache_http: &State<CacheHttp>,
    db: DbConn,
    user: TokenUserId,
) -> Result<NamedFile, SoundsError> {
    let (filename, guild_id) = db
        .run(move |c| {
            use crate::db::schema::soundfiles;
            use crate::db::schema::sounds;

            soundfiles::table
                .find(sound_id)
                .inner_join(sounds::table)
                .select((soundfiles::file_name, sounds::guild_id))
                .first::<(String, BigDecimal)>(c)
        })
        .await?;

    // Check permission
    let guild_id = GuildId(
        guild_id
            .to_u64()
            .ok_or_else(SoundsError::bigdecimal_error)?,
    );
    check_guild_user(cache_http.inner(), &db, user.into(), guild_id).await?;

    // We perform no caching as this request is authenticated
    Ok(NamedFile::open(file_handling::get_full_sound_path(&filename)).await?)
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct CreateSoundParameter {
    guild_id: Snowflake,
    name: String,
    category: String,
    volume_adjustment: Option<f32>,
}

#[post("/", format = "json", data = "<params>")]
async fn create_sound(
    cache_http: &State<CacheHttp>,
    db: DbConn,
    user: UserId,
    params: Json<CreateSoundParameter>,
) -> Result<Json<Sound>, SoundsError> {
    let params = params.into_inner();

    check_guild_moderator(
        cache_http.inner(),
        &db,
        user.clone().into(),
        GuildId(params.guild_id.0),
    )
    .await?;

    let uid = BigDecimal::from_u64(user.0).ok_or_else(SoundsError::bigdecimal_error)?;
    let gid = BigDecimal::from_u64(params.guild_id.0).ok_or_else(SoundsError::bigdecimal_error)?;
    let sound = db
        .run(move |c| {
            use crate::db::schema::sounds;

            diesel::insert_into(sounds::table)
                .values((
                    sounds::guild_id.eq(gid),
                    sounds::name.eq(params.name),
                    sounds::category.eq(params.category),
                    sounds::volume_adjustment.eq(params.volume_adjustment),
                    sounds::created_by_user_id.eq(Some(uid.clone())),
                    sounds::last_edited_by_user_id.eq(Some(uid)),
                ))
                .get_result::<models::Sound>(c)
        })
        .await?;

    Ok(Json(Sound::try_from((sound, None))?))
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct UpdateSoundParameter {
    name: Option<String>,
    category: Option<String>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    volume_adjustment: Option<Option<f32>>,
}

impl From<UpdateSoundParameter> for models::SoundChangeset {
    fn from(s: UpdateSoundParameter) -> Self {
        Self {
            name: s.name,
            category: s.category,
            volume_adjustment: s.volume_adjustment,
        }
    }
}

#[put("/<sound_id>", format = "json", data = "<params>")]
async fn update_sound(
    sound_id: i32,
    cache_http: &State<CacheHttp>,
    db: DbConn,
    user: UserId,
    params: Json<UpdateSoundParameter>,
) -> Result<(), SoundsError> {
    let guild_id = db
        .run(move |c| {
            use crate::db::schema::sounds;

            sounds::table
                .find(sound_id)
                .select(sounds::guild_id)
                .first::<BigDecimal>(c)
        })
        .await?;
    let guild_id = guild_id
        .to_u64()
        .ok_or_else(SoundsError::bigdecimal_error)?;

    check_guild_moderator(
        cache_http.inner(),
        &db,
        user.clone().into(),
        GuildId(guild_id),
    )
    .await?;

    let uid = BigDecimal::from_u64(user.0).ok_or_else(SoundsError::bigdecimal_error)?;
    let params = params.into_inner();
    db.run(move |c| {
        use crate::db::schema::sounds;

        diesel::update(sounds::table.filter(sounds::id.eq(sound_id)))
            .set((
                &models::SoundChangeset::from(params),
                sounds::last_edited_at.eq(SystemTime::now()),
                sounds::last_edited_by_user_id.eq(Some(uid)),
            ))
            .execute(c)
    })
    .await?;

    Ok(())
}

#[delete("/<sound_id>")]
async fn delete_sound(
    sound_id: i32,
    cache_http: &State<CacheHttp>,
    db: DbConn,
    user: UserId,
) -> Result<(), SoundsError> {
    let (guild_id, file_name) = fetch_guild_and_file(sound_id, &db).await?;
    check_guild_moderator(cache_http.inner(), &db, user.into(), GuildId(guild_id)).await?;

    if let Some(file_name) = file_name {
        if let Err(err) = fs::remove_file(file_handling::get_full_sound_path(&file_name)).await {
            if err.kind() != std::io::ErrorKind::NotFound {
                return Err(SoundsError::InternalError(String::from(
                    "Failed to delete the corresponding sound file",
                )));
            }
        }
    }

    let affected_rows = db
        .run(move |c| {
            use crate::db::schema::soundfiles;
            use crate::db::schema::sounds;

            diesel::delete(soundfiles::table.filter(soundfiles::sound_id.eq(sound_id)))
                .execute(c)?;
            diesel::delete(sounds::table.filter(sounds::id.eq(sound_id))).execute(c)
        })
        .await?;

    if affected_rows > 0 {
        Ok(())
    } else {
        Err(SoundsError::NotFound(String::from(
            "A soundfile with the given id does not exist",
        )))
    }
}

#[post("/<sound_id>", format = "audio/mpeg", data = "<file>")]
async fn upload_sound(
    sound_id: i32,
    file: TempFile<'_>,
    cache_http: &State<CacheHttp>,
    db: DbConn,
    user: UserId,
) -> Result<Json<Soundfile>, SoundsError> {
    let (guild_id, file_name) = fetch_guild_and_file(sound_id, &db).await?;
    check_guild_moderator(
        cache_http.inner(),
        &db,
        user.clone().into(),
        GuildId(guild_id),
    )
    .await?;

    let uid = BigDecimal::from_u64(user.0).ok_or_else(SoundsError::bigdecimal_error)?;
    let file_name = file_name.unwrap_or(format!("{}_{}.mp3", guild_id, sound_id));
    let file_path = file_handling::get_full_sound_path(&file_name);

    let save_res = save_sound_file(sound_id, uid, file_name, &file_path, file, &db).await;

    if save_res.is_err() {
        // Clean up everything
        let delete_res = fs::remove_file(&file_path).await;
        let db_res = db
            .run(move |c| {
                use crate::db::schema::soundfiles;
                diesel::delete(soundfiles::table.filter(soundfiles::sound_id.eq(sound_id)))
                    .execute(c)
            })
            .await;

        delete_res?;
        db_res?;
    }

    save_res
}

async fn save_sound_file(
    sound_id: i32,
    user_id: BigDecimal,
    file_name: String,
    file_path: &PathBuf,
    mut file: TempFile<'_>,
    db: &DbConn,
) -> Result<Json<Soundfile>, SoundsError> {
    file.move_copy_to(file_path).await?;

    let volume = audio_utils::detect_volume(file_path).await;
    let length = audio_utils::get_length(file_path).await;
    if let (Some(volume), Some(length)) = (volume, length) {
        let sound_info = models::Soundfile {
            sound_id,
            file_name,
            max_volume: volume.max_volume,
            mean_volume: volume.mean_volume,
            length,
            uploaded_by_user_id: Some(user_id),
            uploaded_at: SystemTime::now(),
        };

        {
            let sound_info = sound_info.clone();
            db.run(move |c| {
                use crate::db::schema::soundfiles;

                diesel::insert_into(soundfiles::table)
                    .values(&sound_info)
                    .on_conflict(soundfiles::sound_id)
                    .do_update()
                    .set(&sound_info)
                    .execute(c)
            })
            .await?;
        }

        Ok(Json(Soundfile {
            max_volume: sound_info.max_volume,
            mean_volume: sound_info.mean_volume,
            length: sound_info.length,
            uploaded_at: sound_info.uploaded_at,
        }))
    } else {
        // The sound file might be invalid -> return error
        Err(SoundsError::InvalidSoundfile(String::from(
            "File could not be analyzed. Is it corrupted?",
        )))
    }
}

async fn fetch_guild_and_file(
    sound_id: i32,
    db: &DbConn,
) -> Result<(u64, Option<String>), SoundsError> {
    let (guild_id, file_name) = db
        .run(move |c| {
            use crate::db::schema::soundfiles;
            use crate::db::schema::sounds;

            sounds::table
                .find(sound_id)
                .left_join(soundfiles::table)
                .select((sounds::guild_id, soundfiles::file_name.nullable()))
                .first::<(BigDecimal, Option<String>)>(c)
        })
        .await?;

    Ok((
        guild_id
            .to_u64()
            .ok_or_else(SoundsError::bigdecimal_error)?,
        file_name,
    ))
}
