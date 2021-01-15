use crate::discord::recorder::Recorder;
use crate::CacheHttp;
use crate::BUILD_ID;
use crate::BUILD_TIMESTAMP;
use crate::VERSION;
use lazy_static::lazy_static;
use rocket::error::Error as RocketError;
use rocket::get;
use rocket::routes;
use rocket_contrib::json::Json;
use serde::Serialize;
use songbird::Songbird;
use std::env::var;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use utils::CachedFile;

mod discord;
mod recorder;
mod sound_browser;
mod utils;

lazy_static! {
  // Used for generating the direct URLs for the sound files
  pub static ref BASE_URL: String = var("BASE_URL").unwrap_or(String::from(""));
  // Custom settings for the frontend
  static ref APP_TITLE: Option<String> = var("APP_TITLE").ok();
  static ref FILE_MANAGEMENT_URL: Option<String> = var("FILE_MANAGEMENT_URL").ok();
  static ref RANDOM_INFIXES: Vec<String> = var("RANDOM_INFIXES").map(|s| s.split(",").map(|infix| String::from(infix.trim())).collect::<Vec<String>>()).unwrap_or(Vec::new());
}

pub async fn run(
  cache_http: CacheHttp,
  songbird: Arc<Songbird>,
  recorder: Arc<Recorder>,
) -> Result<(), RocketError> {
  rocket::ignite()
    .mount("/", routes![index, files, info, random_infixes])
    .mount("/api/discord", discord::get_routes())
    .mount("/api/sounds", sound_browser::get_routes())
    .mount("/api/recorder", recorder::get_routes())
    .manage(songbird)
    .manage(cache_http)
    .manage(recorder)
    .launch()
    .await
}

#[get("/")]
async fn index() -> Option<CachedFile> {
  CachedFile::open(Path::new("frontend/index.html"))
    .await
    .ok()
}

#[get("/<path..>", rank = 100)]
async fn files(path: PathBuf) -> Option<CachedFile> {
  CachedFile::open(Path::new("frontend/").join(path))
    .await
    .ok()
}

#[derive(Debug, Serialize)]
struct InfoResponse {
  version: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  build_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  build_timestamp: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  title: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  file_management_url: Option<String>,
}

#[get("/api/info")]
async fn info() -> Json<InfoResponse> {
  Json(InfoResponse {
    version: VERSION.to_string(),
    build_id: BUILD_ID.map(|s| s.to_string()),
    build_timestamp: BUILD_TIMESTAMP.and_then(|s| s.parse::<u64>().ok()),
    title: APP_TITLE.clone(),
    file_management_url: FILE_MANAGEMENT_URL.clone(),
  })
}

#[get("/api/randominfixes")]
async fn random_infixes() -> Json<Vec<String>> {
  Json(RANDOM_INFIXES.clone())
}
