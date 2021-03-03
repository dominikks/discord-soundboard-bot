#![feature(proc_macro_hygiene, decl_macro, async_closure)]
// Needed for Diesel Postgres linking for MUSL
// https://github.com/emk/rust-musl-builder#making-diesel-work
extern crate openssl;
#[macro_use]
extern crate diesel;
#[macro_use]
extern crate diesel_migrations;
#[macro_use]
extern crate lazy_static;
#[macro_use]
extern crate rocket;
#[macro_use]
extern crate tracing;

mod api;
mod audio_utils;
mod db;
mod discord;
mod file_handling;

use discord::client::DiscordClient;
use discord::CacheHttp;
use dotenv::dotenv;
use std::env;
use tokio::select;
use tracing_subscriber::{fmt, EnvFilter};

lazy_static! {
  // URL under which the app is reachable
  static ref BASE_URL: String = env::var("BASE_URL").expect("BASE_URL must be supplied in env");
}

pub const VERSION: &'static str = env!("CARGO_PKG_VERSION");
pub const BUILD_ID: Option<&'static str> = option_env!("BUILD_ID");
pub const BUILD_TIMESTAMP: Option<&'static str> = option_env!("BUILD_TIMESTAMP");

#[tokio::main]
async fn main() {
  // Load .env file
  dotenv().ok();

  // Disable serenity logging because it leads to audio problems
  let filter = EnvFilter::from_default_env()
    .add_directive("serenity=off".parse().unwrap())
    .add_directive("songbird=off".parse().unwrap());
  let format = fmt::format();
  let subscriber = fmt().event_format(format).with_env_filter(filter).finish();
  tracing::subscriber::set_global_default(subscriber).expect("setting tracing default failed");

  file_handling::create_folders()
    .await
    .expect("failed to create data-folders");

  let mut client = DiscordClient::new().await;
  let cache_http = CacheHttp::from(&client.client.cache_and_http);
  let songbird = client.songbird.clone();
  let recorder = client.recorder.clone();
  let discord_future = client.run();

  let rocket_future = api::run(cache_http, songbird, recorder);

  info!("Startup successful");
  select!(_ = discord_future => info!("Serenity terminated"), _ = rocket_future => info!("Rocket terminated"));
}
