use crate::audio_utils;
use crate::discord::player;
use crate::discord::player::PlayError as DiscordPlayError;
use crate::discord::recorder::Recorder;
use crate::discord::recorder::RecordingError;
use crate::discord::CacheHttp;
use crate::file_handling;
use rocket::get;
use rocket::http::Status;
use rocket::post;
use rocket::response::status;
use rocket::response::Responder;
use rocket::routes;
use rocket::Route;
use rocket::State;
use rocket_contrib::json::Json;
use serde::Serialize;
use serenity::model::id::GuildId;
use songbird::Songbird;
use std::path::PathBuf;
use std::sync::Arc;
use tracing::error;

pub fn get_routes() -> Vec<Route> {
  routes![list_guilds, stop, play, record]
}

#[derive(Debug, Serialize)]
struct Guild {
  id: u64,
  name: Option<String>,
}

#[get("/")]
async fn list_guilds(cache_http: State<'_, CacheHttp>) -> Json<Vec<Guild>> {
  let mut response = Vec::new();
  let guilds = cache_http.inner().cache.guilds().await;
  for guild_id in guilds.into_iter() {
    let GuildId(id) = guild_id;
    response.push(Guild {
      id: id,
      name: guild_id.name(&cache_http.inner().cache).await,
    });
  }
  Json(response)
}

#[post("/<guildid>/stop")]
async fn stop(
  guildid: u64,
  songbird: State<'_, Arc<Songbird>>,
) -> Result<String, status::Custom<String>> {
  if player::stop(GuildId(guildid), songbird.inner().clone()).await {
    Ok(String::from("Stopped playback"))
  } else {
    Err(status::Custom(
      Status::InternalServerError,
      String::from("Failed to stop the playback"),
    ))
  }
}

#[derive(Debug, Serialize)]
struct Volume {
  max_volume: f32,
  mean_volume: f32,
}

impl From<audio_utils::VolumeInformation> for Volume {
  fn from(vol: audio_utils::VolumeInformation) -> Self {
    Self {
      max_volume: vol.max_volume,
      mean_volume: vol.mean_volume,
    }
  }
}

#[derive(Debug, Serialize)]
struct PlayResult {
  sound_volume: Option<Volume>,
  volume_adjustment: f32,
}

#[derive(Debug, Responder)]
enum PlayError {
  #[response(status = 404)]
  NotFound(String),
  #[response(status = 503)]
  ServiceUnavailable(String),
}

impl From<DiscordPlayError> for PlayError {
  fn from(error: DiscordPlayError) -> Self {
    match error {
      DiscordPlayError::FailedToJoinChannel => {
        PlayError::ServiceUnavailable(String::from("Unable to join a voice channel"))
      }
      DiscordPlayError::AnalysisFailed => {
        PlayError::ServiceUnavailable(String::from("Failed to analyze sound file"))
      }
      DiscordPlayError::Decoding(_) => PlayError::NotFound(String::from(
        "Error decoding soundfile, the file might be corrupted.",
      )),
    }
  }
}

#[post("/<guildid>/play/<path..>")]
async fn play(
  guildid: u64,
  path: PathBuf,
  songbird: State<'_, Arc<Songbird>>,
  cache_http: State<'_, CacheHttp>,
) -> Result<Json<PlayResult>, PlayError> {
  let sound = file_handling::get_sound(&path)
    .await
    .ok_or(PlayError::NotFound(format!(
      "Sound file '{}' not found",
      path.to_string_lossy(),
    )))?;

  let play_info = player::play(
    &sound,
    GuildId(guildid),
    songbird.inner().clone(),
    cache_http.inner(),
  )
  .await?;

  Ok(Json(PlayResult {
    sound_volume: play_info.volume.map(|v| v.into()),
    volume_adjustment: play_info.volume_adjustment,
  }))
}

#[post("/<guildid>/record")]
async fn record(
  guildid: u64,
  recorder: State<'_, Arc<Recorder>>,
  cache_http: State<'_, CacheHttp>,
) -> Result<String, status::Custom<String>> {
  match recorder
    .inner()
    .save_recording(GuildId(guildid), &cache_http.inner())
    .await
  {
    Ok(_) => Ok(String::from("Recording saved")),
    Err(err) => {
      error!(?err, "Failed to record");
      match err {
        RecordingError::IoError(err) => Err(status::Custom(
          Status::InternalServerError,
          format!("Internal I/O error: {}", err),
        )),
        RecordingError::NoData => Err(status::Custom(
          Status::NotFound,
          format!("No data available to record"),
        )),
      }
    }
  }
}
