use crate::discord::commands;
use crate::discord::recorder::Recorder;
use crate::discord::recorder::RecorderInit;
use serenity::async_trait;
use serenity::client::Client;
use serenity::client::Context;
use serenity::client::EventHandler;
use serenity::model::gateway::Ready;
use songbird::driver::Config as DriverConfig;
use songbird::driver::DecodeMode;
use songbird::SerenityInit;
use songbird::Songbird;
use std::env;
use std::sync::Arc;
use tracing::{info, instrument};

struct Handler;

#[async_trait]
impl EventHandler for Handler {
  #[instrument(skip(self, ready))]
  async fn ready(&self, _: Context, ready: Ready) {
    info!("{} is connected!", ready.user.name);
  }
}

pub struct DiscordClient {
  pub client: Client,
  pub songbird: Arc<Songbird>,
  pub recorder: Arc<Recorder>,
}

impl DiscordClient {
  #[instrument]
  pub async fn new() -> Self {
    let token = env::var("DISCORD_TOKEN").expect("Expected DISCORD_TOKEN in the environment");

    let songbird = Songbird::serenity();
    songbird.set_config(DriverConfig::default().decode_mode(DecodeMode::Decode));

    let framework = commands::create_framework();
    let recorder = Recorder::create();

    let client = Client::builder(&token)
      .event_handler(Handler)
      .framework(framework)
      .register_songbird_with(songbird.clone().into())
      .register_recorder(recorder.clone())
      .await
      .expect("Error creating client");

    return Self {
      client,
      songbird,
      recorder,
    };
  }

  #[instrument(skip(self))]
  pub async fn run(&mut self) {
    if let Err(why) = self.client.start().await {
      info!("Client ended: {:?}", why);
    }
  }
}
