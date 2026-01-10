use crate::discord::client;
use crate::discord::recorder::RecordingError;
use crate::BASE_URL;
use crate::BUILD_ID;
use crate::BUILD_TIMESTAMP;
use crate::VERSION;
use serenity::client::Context;
use serenity::framework::standard::macros::command;
use serenity::framework::standard::macros::group;
use serenity::framework::standard::CommandResult;
use serenity::framework::StandardFramework;
use serenity::model::channel::Message;
use serenity::model::prelude::ReactionType;
use serenity::model::prelude::UserId;
use serenity::prelude::*;
use serenity::Result as SerenityResult;
use std::convert::TryFrom;
use std::fmt::Write;

/// Creates the framework used by the discord client
pub fn create_framework(_bot_id: UserId) -> StandardFramework {
    // StandardFramework is deprecated in serenity 0.12
    // but we'll continue using it for compatibility
    StandardFramework::default()
}

#[group]
#[commands(join, leave, stop, ping, record, guildid, info)]
struct General;

#[command]
#[only_in(guilds)]
async fn join(ctx: &Context, msg: &Message) -> CommandResult {
    let guild_id = msg
        .guild_id
        .expect("Guild ID should exist in guild context");

    let client = client::get(ctx)
        .await
        .expect("Discord client placed in at initialization");

    match client.join_user(guild_id, msg.author.id, &ctx.into()).await {
        Ok((channel_id, _)) => check_msg(
            msg.channel_id
                .say(
                    &ctx.http,
                    &format!(":white_check_mark: Joined {}", channel_id.mention()),
                )
                .await,
        ),
        Err(client::ClientError::UserNotFound) => {
            check_msg(msg.reply(&ctx, ":x: Not in a voice channel").await)
        }
        _ => check_msg(msg.reply(&ctx, ":x: Connection error").await),
    };

    Ok(())
}

#[command]
#[only_in(guilds)]
async fn leave(ctx: &Context, msg: &Message) -> CommandResult {
    let guild_id = msg
        .guild_id
        .expect("Guild ID should exist in guild context");

    let client = client::get(ctx)
        .await
        .expect("Discord client placed in at initialization");

    match client.leave(guild_id).await {
        Ok(_) => check_msg(msg.channel_id.say(&ctx.http, "Left voice channel").await),
        Err(client::ClientError::NotInAChannel) => {
            check_msg(msg.reply(&ctx, ":x: Not in a voice channel").await)
        }
        _ => check_msg(msg.reply(&ctx, ":x: Connection error").await),
    }

    Ok(())
}

#[command]
async fn ping(ctx: &Context, msg: &Message) -> CommandResult {
    check_msg(msg.channel_id.say(&ctx.http, "Pong!").await);
    Ok(())
}

#[command]
#[only_in(guilds)]
async fn stop(ctx: &Context, msg: &Message) -> CommandResult {
    let guild_id = msg
        .guild_id
        .expect("Guild ID should exist in guild context");

    let client = client::get(ctx)
        .await
        .expect("Discord client placed in at initialisation.");

    match client.stop(guild_id).await {
        Ok(_) => check_msg(msg.channel_id.say(&ctx.http, ":stop_button: Stopped").await),
        Err(client::ClientError::NotInAChannel) => check_msg(
            msg.channel_id
                .say(&ctx.http, ":x: Not in a voice channel to play in")
                .await,
        ),
        _ => unreachable!(),
    }

    Ok(())
}

#[command]
#[only_in(guilds)]
async fn record(ctx: &Context, msg: &Message) -> CommandResult {
    let reaction = msg
        .react(&ctx.http, ReactionType::try_from("⏬").unwrap())
        .await;

    let guild_id = msg
        .guild_id
        .expect("Guild ID should exist in guild context");
    let client = client::get(ctx)
        .await
        .expect("Recorder placed in at initialization");

    match client.recorder.save_recording(guild_id, &ctx.into()).await {
        Ok(_) => check_msg(
            msg.channel_id
                .say(&ctx.http, ":white_check_mark: Recording saved")
                .await,
        ),
        Err(err) => {
            error!(?err, "Failed to record");
            match err {
                RecordingError::IoError(_) => check_msg(
                    msg.channel_id
                        .say(&ctx.http, ":x: Failed to save recording")
                        .await,
                ),
                RecordingError::NoData => {
                    check_msg(msg.channel_id.say(&ctx.http, ":x: No data to record").await)
                }
            }
        }
    }

    if let Ok(reaction) = reaction {
        let _ = reaction.delete(&ctx.http).await;
    }

    Ok(())
}

#[command]
#[only_in(guilds)]
async fn guildid(ctx: &Context, msg: &Message) -> CommandResult {
    let guild_id = msg
        .guild_id
        .expect("Guild ID should exist in guild context");

    check_msg(
        msg.channel_id
            .say(&ctx.http, format!("GuildId: `{}`", guild_id))
            .await,
    );

    Ok(())
}

#[command]
async fn info(ctx: &Context, msg: &Message) -> CommandResult {
    let mut resp = format!(
        "discord-soundboard-bot v{}\n\
    Control at {}\n\
    Source code at https://github.com/dominikks/discord-soundboard-bot",
        VERSION,
        BASE_URL.clone()
    );
    if let (Some(bid), Some(bt)) = (BUILD_ID, BUILD_TIMESTAMP) {
        write!(resp, "\n\nbuild {}, timestamp {}", bid, bt)?;
    }
    check_msg(msg.channel_id.say(&ctx.http, &resp).await);

    Ok(())
}

/// Checks that a message successfully sent; if not, then logs why to stdout.
#[instrument]
fn check_msg(result: SerenityResult<Message>) {
    if let Err(why) = result {
        error!("Error sending message: {:?}", why);
    }
}
