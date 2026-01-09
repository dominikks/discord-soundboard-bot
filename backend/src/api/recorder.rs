use crate::api::auth::UserId;
use crate::api::utils::CachedFile;
use crate::api::Snowflake;
use crate::db::DbConn;
use crate::discord::management::check_guild_user;
use crate::discord::management::get_guilds_for_user;
use crate::discord::management::PermissionError;
use crate::file_handling;
use crate::file_handling::MIXES_FOLDER;
use crate::file_handling::RECORDINGS_FOLDER;
use crate::CacheHttp;
use crate::BASE_URL;
use rand::random;
use rocket::http::Status;
use rocket::response::{self, Responder, Response};
use rocket::serde::json::Json;
use rocket::Request;
use rocket::Route;
use rocket::State;
use serde::Deserialize;
use serde::Serialize;
use serenity::model::id::GuildId;
use std::convert::TryFrom;
use std::ffi::OsString;
use std::path::Path;
use std::process::Stdio;
use std::time::SystemTime;
use thiserror::Error;
use tokio::fs;
use tokio::io;
use tokio::process::Command;
use tokio::time::sleep;
use tokio::time::Duration;
use tracing::Instrument;
use tracing::Level;

pub fn get_routes() -> Vec<Route> {
    routes![
        get_recordings,
        mix_recording,
        delete_recording,
        get_recording,
        get_mix
    ]
}

#[derive(Debug, Error)]
enum RecorderError {
    #[error("Internal error: {0}")]
    InternalError(String),

    #[error("IO error: {0}")]
    IoError(#[from] io::Error),

    #[error("Request error: {0}")]
    RequestError(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Not a member: you must be a member of the guild to perform this task")]
    NotAMember(#[from] PermissionError),

    #[error("Failed to encode file name: {0:?}")]
    FileNameEncoding(OsString),

    #[error("Error handling recordings: {0}")]
    FileHandling(#[from] file_handling::FileError),

    #[error("Discord API error: {0}")]
    SerenityError(#[from] serenity::Error),
}

impl RecorderError {
    fn status_code(&self) -> Status {
        match self {
            Self::InternalError(_) => Status::InternalServerError,
            Self::IoError(_) => Status::InternalServerError,
            Self::RequestError(_) => Status::BadRequest,
            Self::NotFound(_) => Status::NotFound,
            Self::NotAMember(_) => Status::Unauthorized,
            Self::FileNameEncoding(_) => Status::InternalServerError,
            Self::FileHandling(_) => Status::InternalServerError,
            Self::SerenityError(_) => Status::InternalServerError,
        }
    }
}

impl From<OsString> for RecorderError {
    fn from(err: OsString) -> Self {
        Self::FileNameEncoding(err)
    }
}

impl<'r> Responder<'r, 'static> for RecorderError {
    fn respond_to(self, req: &'r Request<'_>) -> response::Result<'static> {
        let status = self.status_code();
        let error_message = self.to_string();

        Response::build_from(error_message.respond_to(req)?)
            .status(status)
            .ok()
    }
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct Recording {
    guild_id: Snowflake,
    timestamp: u64,
    length: f32,
    users: Vec<RecordingUser>,
}

#[derive(Serialize, Debug)]
struct RecordingUser {
    /// Externally, we use the file nameas id. Is a unique id together with the guild_id and timestamp.
    id: String,
    username: String,
}

impl TryFrom<file_handling::Recording> for Recording {
    type Error = RecorderError;

    fn try_from(r: file_handling::Recording) -> std::result::Result<Self, Self::Error> {
        let users: Result<Vec<RecordingUser>, _> = r
            .users
            .into_iter()
            .map(|user| {
                user.file_name
                    .clone()
                    .into_string()
                    .map(|file_name| RecordingUser {
                        id: file_name,
                        username: user.name,
                    })
            })
            .collect();

        Ok(Self {
            guild_id: Snowflake(r.guild_id),
            timestamp: r
                .timestamp
                .duration_since(SystemTime::UNIX_EPOCH)
                .map_err(|_| {
                    RecorderError::InternalError(String::from("Failed to handle timestamps"))
                })?
                .as_secs(),
            length: r.length,
            users: users?,
        })
    }
}

#[instrument(skip(cache_http, db, user))]
#[get("/recordings")]
async fn get_recordings(
    cache_http: &State<CacheHttp>,
    db: DbConn,
    user: UserId,
) -> Result<Json<Vec<Recording>>, RecorderError> {
    let guilds = get_guilds_for_user(cache_http.inner(), &db, user.into()).await?;
    let mut results = vec![];
    for (guild, _) in guilds.iter() {
        results.append(&mut file_handling::get_recordings_for_guild(guild.id.0).await?);
    }
    let results: Result<Vec<_>, _> = results.into_iter().map(Recording::try_from).collect();
    Ok(Json(results?))
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct MixingParameter {
    /// Where the mixed part should start and end. To calculate this, the sound
    /// files are assumed to be aligned at the end.
    start: f32,
    end: f32,
    /// All files that should be included
    user_ids: Vec<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct MixingResult {
    download_url: String,
}

#[instrument(skip(params, cache_http, db, user))]
#[post(
    "/guilds/<guild_id>/recordings/<timestamp>",
    format = "json",
    data = "<params>"
)]
async fn mix_recording(
    guild_id: u64,
    timestamp: u64,
    params: Json<MixingParameter>,
    cache_http: &State<CacheHttp>,
    db: DbConn,
    user: UserId,
) -> Result<Json<MixingResult>, RecorderError> {
    let guild_id = GuildId(guild_id);
    check_guild_user(cache_http.inner(), &db, user.into(), guild_id).await?;

    let params = params.0;
    if params.user_ids.is_empty() {
        return Err(RecorderError::RequestError(String::from(
            "At least one user must be specified",
        )));
    }
    if params.start >= params.end {
        return Err(RecorderError::RequestError(String::from(
            "End must lie after Start",
        )));
    }
    let folder = (*RECORDINGS_FOLDER)
        .join(guild_id.0.to_string())
        .join(timestamp.to_string());
    if !folder.exists() {
        return Err(RecorderError::NotFound(format!(
            "Recording {} not found",
            timestamp
        )));
    }

    let files: Vec<_> = params
        .user_ids
        .iter()
        .map(|user| folder.join(sanitize_filename::sanitize(user)))
        .collect();

    let filter = format!(
        "amix=inputs={}:duration=longest, atrim={}:{}",
        files.len(),
        params.start,
        params.end
    );
    let static_args = vec!["-ac", "2", "-filter_complex", &filter];

    let mut dynamic_args = Vec::new();
    for file in files {
        dynamic_args.push(OsString::from("-i"));
        dynamic_args.push(file.into_os_string());
    }

    let file_name = format!("{}.mp3", random::<u32>());
    let out_dir = (*MIXES_FOLDER).join(guild_id.0.to_string());
    fs::create_dir_all(&out_dir).await?;
    let out_file = out_dir.join(&file_name);

    let ffmpeg_out = Command::new("ffmpeg")
        .kill_on_drop(true)
        .args(&static_args)
        .args(&dynamic_args)
        .arg(&out_file)
        .stdin(Stdio::null())
        .output()
        .await?;
    if !ffmpeg_out.status.success() {
        let output = String::from_utf8(ffmpeg_out.stderr);
        error!(?output, "Failed to mix file with ffmpeg");
        return Err(RecorderError::InternalError(String::from(
            "Failed to mix recording",
        )));
    }

    // Automatically delete the mix after 5 minutes
    let span = span!(Level::INFO, "mix_gc");
    tokio::spawn(
        async move {
            sleep(Duration::from_secs(5 * 60)).await;
            let result = fs::remove_file(Path::new(&out_file)).await;
            debug!(?out_file, ?result, "Removing timed out mix");
        }
        .instrument(span),
    );

    Ok(Json(MixingResult {
        download_url: format!(
            "{}/api/guilds/{}/mixes/{}",
            BASE_URL.clone(),
            guild_id,
            file_name
        ),
    }))
}

#[delete("/guilds/<guild_id>/recordings/<timestamp>")]
async fn delete_recording(
    guild_id: u64,
    timestamp: u64,
    cache_http: &State<CacheHttp>,
    db: DbConn,
    user: UserId,
) -> Result<(), RecorderError> {
    let guild_id = GuildId(guild_id);
    check_guild_user(cache_http.inner(), &db, user.into(), guild_id).await?;

    let folder = (*RECORDINGS_FOLDER)
        .join(guild_id.to_string())
        .join(timestamp.to_string());
    if !folder.exists() {
        return Err(RecorderError::NotFound(String::from("Recording not found")));
    }
    fs::remove_dir_all(folder).await?;

    Ok(())
}

#[get("/guilds/<guild_id>/recordings/<timestamp>/<filename>")]
async fn get_recording(
    guild_id: u64,
    timestamp: u64,
    filename: String,
    cache_http: &State<CacheHttp>,
    db: DbConn,
    user: UserId,
) -> Option<CachedFile> {
    let guild_id = GuildId(guild_id);
    check_guild_user(cache_http.inner(), &db, user.into(), guild_id)
        .await
        .ok()?;

    CachedFile::open(
        (*RECORDINGS_FOLDER)
            .join(guild_id.0.to_string())
            .join(timestamp.to_string())
            .join(sanitize_filename::sanitize(filename)),
    )
    .await
    .ok()
}

#[get("/guilds/<guild_id>/mixes/<filename>")]
async fn get_mix(
    guild_id: u64,
    filename: String,
    cache_http: &State<CacheHttp>,
    db: DbConn,
    user: UserId,
) -> Option<CachedFile> {
    let guild_id = GuildId(guild_id);
    check_guild_user(cache_http.inner(), &db, user.into(), guild_id)
        .await
        .ok()?;

    CachedFile::open(
        (*MIXES_FOLDER)
            .join(guild_id.0.to_string())
            .join(sanitize_filename::sanitize(filename)),
    )
    .await
    .ok()
}
