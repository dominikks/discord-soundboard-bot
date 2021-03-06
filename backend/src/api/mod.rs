use crate::api::auth::UserId;
use crate::db;
use crate::discord::recorder::Recorder;
use crate::CacheHttp;
use crate::BUILD_ID;
use crate::BUILD_TIMESTAMP;
use crate::VERSION;
use rocket::error::Error as RocketError;
use rocket::fairing::AdHoc;
use rocket_contrib::helmet::SpaceHelmet;
use rocket_contrib::json::Json;
use serde::Deserialize;
use serde::Serialize;
use serde_with::serde_as;
use serde_with::skip_serializing_none;
use serde_with::DisplayFromStr;
use songbird::Songbird;
use std::env::var;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use utils::CachedFile;

mod auth;
mod commands;
mod recorder;
mod settings;
mod sounds;
mod utils;

/// 64 bit integers can not be accurately represented in javascript. They are therefore
/// treated as strings. This is similar to the Twitter Snowflake type.
#[serde_as]
#[derive(Deserialize, Serialize, Clone, Debug, PartialEq, Eq, Hash)]
struct Snowflake(#[serde_as(as = "DisplayFromStr")] pub u64);

lazy_static! {
  // Custom settings for the frontend
  static ref APP_TITLE: Option<String> = var("APP_TITLE").ok();
  // Discord data found in env
  static ref DISCORD_CLIENT_ID: String = var("DISCORD_CLIENT_ID").expect("Expected DISCORD_CLIENT_ID as env");
  static ref DISCORD_CLIENT_SECRET: String = var("DISCORD_CLIENT_SECRET").expect("Expected DISCORD_CLIENT_SECRET as env");
}

pub async fn run(
  cache_http: CacheHttp,
  songbird: Arc<Songbird>,
  recorder: Arc<Recorder>,
) -> Result<(), RocketError> {
  rocket::ignite()
    .attach(SpaceHelmet::default())
    .attach(db::DbConn::fairing())
    .attach(AdHoc::on_attach(
      "Database Migrations",
      db::run_db_migrations,
    ))
    .mount("/", routes![index, files, info])
    .mount("/api", auth::get_routes())
    .mount("/api/guilds", commands::get_routes())
    .mount("/api/sounds", sounds::get_routes())
    .mount("/api", recorder::get_routes())
    .mount("/api", settings::get_routes())
    .manage(songbird)
    .manage(cache_http)
    .manage(recorder)
    .manage(auth::get_oauth_client())
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

#[skip_serializing_none]
#[serde(rename_all = "camelCase")]
#[derive(Debug, Serialize)]
struct InfoResponse {
  version: String,
  build_id: Option<String>,
  build_timestamp: Option<u64>,
  title: Option<String>,
  discord_client_id: String,
}

#[get("/api/info")]
async fn info() -> Json<InfoResponse> {
  Json(InfoResponse {
    version: VERSION.to_string(),
    build_id: BUILD_ID.map(|s| s.to_string()),
    build_timestamp: BUILD_TIMESTAMP.and_then(|s| s.parse::<u64>().ok()),
    title: APP_TITLE.clone(),
    discord_client_id: DISCORD_CLIENT_ID.clone(),
  })
}
