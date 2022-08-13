use crate::discord::client::Client;
use crate::discord::client::ClientInit;
use crate::discord::commands;
use crate::CacheHttp;
use serenity::async_trait;
use serenity::client::Client as SerenityClient;
use serenity::client::Context;
use serenity::client::EventHandler;
use serenity::http::Http;
use serenity::model::gateway::GatewayIntents;
use serenity::model::gateway::Ready;
use serenity::model::id::GuildId;
use std::env;

struct Handler;

#[async_trait]
impl EventHandler for Handler {
    #[instrument(skip(self, _ctx, ready))]
    async fn ready(&self, _ctx: Context, ready: Ready) {
        info!("{} is connected!", ready.user.name);
    }

    #[instrument(skip(self, _ctx))]
    async fn cache_ready(&self, _ctx: Context, _guilds: Vec<GuildId>) {
        debug!("Cache is ready");
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

        // Get the Bot ID
        let http = Http::new(&token);
        let bot_id = http
            .get_current_user()
            .await
            .map(|user| user.id)
            .expect("Failed to access bot id");

        let framework = commands::create_framework(bot_id);
        let client = Client::new();

        // Those intents also update the Serenity cache
        let intents = GatewayIntents::GUILDS
            | GatewayIntents::GUILD_MEMBERS
            | GatewayIntents::GUILD_VOICE_STATES
            | GatewayIntents::GUILD_MESSAGES;

        let serenity_client = SerenityClient::builder(&token, intents)
            .event_handler(Handler)
            .framework(framework)
            .register_client(&client)
            .await
            .expect("Error creating client");

        Self {
            cache_http: CacheHttp::from(&serenity_client.cache_and_http),
            serenity_client,
            client,
        }
    }

    #[instrument(skip(self))]
    pub async fn run(&mut self) {
        if let Err(why) = self.serenity_client.start().await {
            error!("Discord client ended: {:?}", why);
        }
    }
}
