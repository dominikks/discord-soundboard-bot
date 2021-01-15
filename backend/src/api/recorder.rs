use crate::api::CachedFile;
use crate::api::BASE_URL;
use crate::audio_utils::get_length;
use crate::file_handling::MIXES_FOLDER;
use crate::file_handling::RECORDINGS_FOLDER;
use rand::random;
use rocket::delete;
use rocket::get;
use rocket::http::uri::Uri;
use rocket::post;
use rocket::response::Responder;
use rocket::routes;
use rocket::Route;
use rocket_contrib::json::Json;
use sanitize_filename;
use serde::Deserialize;
use serde::Serialize;
use std::ffi::OsString;
use std::path::Path;
use std::process::Stdio;
use tokio::fs;
use tokio::fs::ReadDir;
use tokio::io;
use tokio::process::Command;
use tokio::time::sleep;
use tokio::time::Duration;
use tracing::debug;
use tracing::instrument;
use tracing::span;
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

#[derive(Debug, Responder)]
enum RecorderError {
  #[response(status = 500)]
  IoError(String),
  #[response(status = 400)]
  RequestError(String),
  #[response(status = 404)]
  NotFound(String),
}

impl From<io::Error> for RecorderError {
  fn from(_: io::Error) -> Self {
    RecorderError::IoError(String::from("IO Error"))
  }
}

impl From<OsString> for RecorderError {
  fn from(_: OsString) -> Self {
    RecorderError::IoError(String::from("Failed to encode file name"))
  }
}

#[derive(Serialize, Debug)]
struct Recording {
  timestamp: u64,
  users: Vec<RecordingUser>,
  length: f32,
}

#[derive(Serialize, Debug)]
struct RecordingUser {
  username: String,
  url: String,
}

#[get("/recordings")]
async fn get_recordings() -> Result<Json<Vec<Recording>>, RecorderError> {
  let mut dir = (fs::read_dir(RECORDINGS_FOLDER).await as Result<ReadDir, io::Error>)?;

  let mut output = Vec::new();
  while let Some(file) = dir.next_entry().await? {
    let filename = file.file_name().into_string()?;
    let metadata = file.metadata().await?;

    if metadata.is_dir() {
      if let Ok(timestamp) = filename.parse::<u64>() {
        let mut rec_dir = (fs::read_dir(file.path()).await as Result<ReadDir, io::Error>)?;

        let mut users = Vec::new();
        let mut length: f32 = 0.0;
        while let Some(rec_file) = rec_dir.next_entry().await? {
          users.push(RecordingUser {
            username: String::from(
              rec_file
                .path()
                .file_stem()
                .and_then(|stem| stem.to_str())
                .ok_or(RecorderError::IoError(String::from(
                  "Failed to remove file extension",
                )))?,
            ),
            url: format!(
              "{}/api/recorder/recordings/{}/{}",
              BASE_URL.clone(),
              timestamp,
              Uri::percent_encode(&rec_file.file_name().into_string()?)
            ),
          });

          length = length.max(get_length(rec_file.path().as_os_str()).await.unwrap_or(0.0));
        }

        output.push(Recording {
          timestamp,
          users,
          length,
        });
      }
    }
  }

  Ok(Json(output))
}

#[derive(Deserialize, Debug)]
struct MixingParameter {
  /// Where the mixed part should start and end. To calculate this, the sound
  /// files are assumed to be aligned at the end.
  start: f32,
  end: f32,
  /// All files that should be included
  users: Vec<String>,
}

#[derive(Serialize, Debug)]
struct MixingResult {
  download_url: String,
}

#[instrument]
#[post("/recordings/<timestamp>", format = "json", data = "<params>")]
async fn mix_recording(
  timestamp: u64,
  params: Json<MixingParameter>,
) -> Result<Json<MixingResult>, RecorderError> {
  debug!("Creating mix of recordings");
  let params = params.0;
  if params.users.len() == 0 {
    return Err(RecorderError::RequestError(String::from(
      "At least one user must be specified",
    )));
  }
  if params.start >= params.end {
    return Err(RecorderError::RequestError(String::from(
      "End must lie after Start",
    )));
  }
  let folder = format!("{}/{}", RECORDINGS_FOLDER, timestamp);
  if !Path::new(&folder).exists() {
    return Err(RecorderError::NotFound(format!(
      "Recording {} not found",
      timestamp
    )));
  }

  let files: Vec<String> = params
    .users
    .iter()
    .map(|user| format!("{}/{}.mp3", folder, sanitize_filename::sanitize(user)))
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
    dynamic_args.push(String::from("-i"));
    dynamic_args.push(file);
  }

  let file_name = random::<u32>();
  let file_path = format!("{}/{}.mp3", MIXES_FOLDER, file_name);

  let _ = Command::new("ffmpeg")
    .kill_on_drop(true)
    .args(&static_args)
    .args(&dynamic_args)
    .arg(&file_path)
    .stdin(Stdio::null())
    .output()
    .await?;

  // Automatically delete the mix after 5 minutes
  let span = span!(Level::INFO, "mix_gc");
  tokio::spawn(
    async move {
      sleep(Duration::from_secs(5 * 60)).await;
      let result = fs::remove_file(Path::new(&file_path)).await;
      debug!(?file_path, ?result, "Removing timed out mix");
    }
    .instrument(span),
  );

  Ok(Json(MixingResult {
    download_url: format!("{}/api/recorder/mixes/{}.mp3", BASE_URL.clone(), file_name),
  }))
}

#[instrument]
#[delete("/recordings/<timestamp>")]
async fn delete_recording(timestamp: u64) -> Result<(), RecorderError> {
  debug!("Deleting recording");
  let folder = Path::new(RECORDINGS_FOLDER).join(timestamp.to_string());
  if !folder.exists() {
    return Err(RecorderError::NotFound(format!(
      "Recording {} not found",
      timestamp
    )));
  }
  fs::remove_dir_all(folder).await?;

  Ok(())
}

#[get("/recordings/<timestamp>/<filename>")]
async fn get_recording(timestamp: u64, filename: String) -> Option<CachedFile> {
  CachedFile::open(
    Path::new(RECORDINGS_FOLDER)
      .join(timestamp.to_string())
      .join(sanitize_filename::sanitize(filename)),
  )
  .await
  .ok()
}

#[get("/mixes/<filename>")]
async fn get_mix(filename: String) -> Option<CachedFile> {
  CachedFile::open(Path::new(MIXES_FOLDER).join(sanitize_filename::sanitize(filename)))
    .await
    .ok()
}
