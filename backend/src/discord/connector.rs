use crate::discord::client::Client;
use crate::discord::client::ClientInit;
use crate::discord::commands;
use crate::CacheHttp;
use serenity::async_trait;
use serenity::client::bridge::gateway::GatewayIntents;
use serenity::client::Client as SerenityClient;
use serenity::client::Context;
use serenity::client::EventHandler;
use serenity::model::gateway::Ready;
use songbird::driver::DecodeMode;
use songbird::Config as DriverConfig;
use songbird::SerenityInit;
use songbird::Songbird;
use std::env;

struct Handler;

#[async_trait]
impl EventHandler for Handler {
  #[instrument(skip(self, _ctx, ready))]
  async fn ready(&self, _ctx: Context, ready: Ready) {
    info!("{} is connected!", ready.user.name);
  }
}

pub struct Connector {
  pub cache_http: CacheHttp,
  pub client: Client,
  serenity_client: SerenityClient,
}

impl Connector {
  #[instrument]
  pub async fn new() -> Self {
    let token = env::var("DISCORD_TOKEN").expect("Expected DISCORD_TOKEN in env");

    let songbird = Songbird::serenity();
    songbird.set_config(DriverConfig::default().decode_mode(DecodeMode::Decode));

    let framework = commands::create_framework();
    let client = Client::new(songbird.clone());

    let serenity_client = SerenityClient::builder(&token)
      .event_handler(Handler)
      .intents(
        // Those intents also update the Serenity cache
        GatewayIntents::GUILDS
          | GatewayIntents::GUILD_MEMBERS
          | GatewayIntents::GUILD_VOICE_STATES
          | GatewayIntents::GUILD_MESSAGES,
      )
      .framework(framework)
      .register_songbird_with(songbird.into())
      .register_client(&client)
      .await
      .expect("Error creating client");

    return Self {
      cache_http: CacheHttp::from(&serenity_client.cache_and_http),
      serenity_client,
      client,
    };
  }

  #[instrument(skip(self))]
  pub async fn run(&mut self) {
    if let Err(why) = self.serenity_client.start().await {
      info!("Discord client ended: {:?}", why);
    }
  }
}
