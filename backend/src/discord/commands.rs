use crate::discord::player;
use crate::discord::player::PlayError;
use crate::discord::recorder;
use crate::discord::recorder::RecordingError;
use crate::file_handling;
use crate::BUILD_ID;
use crate::BUILD_TIMESTAMP;
use crate::VERSION;
use lazy_static::lazy_static;
use regex::Regex;
use serenity::client::Context;
use serenity::framework::standard::macros::command;
use serenity::framework::standard::macros::group;
use serenity::framework::standard::Args;
use serenity::framework::standard::CommandResult;
use serenity::framework::StandardFramework;
use serenity::model::channel::Message;
use serenity::model::prelude::ReactionType;
use serenity::prelude::*;
use serenity::Result as SerenityResult;
use std::convert::TryFrom;
use std::path::PathBuf;
use tracing::{error, instrument};

/// Creates the framework used by the discord client
pub fn create_framework() -> StandardFramework {
  StandardFramework::new()
    .configure(|c| c.prefix("~").delimiters(vec![","]))
    .group(&GENERAL_GROUP)
}

#[group]
#[commands(join, leave, play, stop, ping, list, record, guildid, version)]
struct General;

#[command]
#[only_in(guilds)]
async fn join(ctx: &Context, msg: &Message) -> CommandResult {
  let guild = msg.guild(&ctx.cache).await.unwrap();
  let guild_id = guild.id;

  let connect_to = match guild
    .voice_states
    .get(&msg.author.id)
    .and_then(|voice_state| voice_state.channel_id)
  {
    Some(channel) => channel,
    None => {
      check_msg(msg.reply(&ctx, ":x: Not in a voice channel").await);

      return Ok(());
    }
  };

  let manager = songbird::get(ctx)
    .await
    .expect("Songbird Voice client placed in at initialisation.")
    .clone();

  let (call_lock, result) = manager.join(guild_id, connect_to).await;

  if result.is_ok() {
    let recorder = recorder::get(ctx)
      .await
      .expect("Recorder placed in at initialization");
    recorder::register_recorder(recorder, guild_id, call_lock).await;

    check_msg(
      msg
        .channel_id
        .say(
          &ctx.http,
          &format!(":white_check_mark: Joined {}", connect_to.mention()),
        )
        .await,
    );
  } else {
    check_msg(
      msg
        .channel_id
        .say(&ctx.http, ":x: Error joining the channel")
        .await,
    );
  }

  Ok(())
}

#[command]
#[only_in(guilds)]
async fn leave(ctx: &Context, msg: &Message) -> CommandResult {
  let guild_id = msg.guild(&ctx.cache).await.unwrap().id;

  let manager = songbird::get(ctx)
    .await
    .expect("Songbird Voice client placed in at initialisation.")
    .clone();

  if manager.get(guild_id).is_some() {
    if let Err(e) = manager.remove(guild_id).await {
      check_msg(
        msg
          .channel_id
          .say(&ctx.http, format!("Failed: {:?}", e))
          .await,
      );
    }

    check_msg(msg.channel_id.say(&ctx.http, "Left voice channel").await);
  } else {
    check_msg(msg.reply(&ctx, ":x: Not in a voice channel").await);
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
async fn play(ctx: &Context, msg: &Message, mut args: Args) -> CommandResult {
  lazy_static! {
    static ref RE: Regex = Regex::new(r"\.\.").unwrap();
  }
  let guild_id = msg.guild(&ctx.cache).await.unwrap().id;

  let path = match args.single::<String>().ok() {
    Some(file_name) => PathBuf::from(&RE.replace_all(&file_name, "").into_owned()),
    None => {
      check_msg(
        msg
          .channel_id
          .say(&ctx.http, ":x: Must provide sound file name as parameter")
          .await,
      );
      return Ok(());
    }
  };

  let sound = match file_handling::get_sound(&path).await {
    Some(sound) => sound,
    None => {
      check_msg(
        msg
          .channel_id
          .say(
            &ctx.http,
            format!(":x: Sound file `{}` not found", path.to_string_lossy()),
          )
          .await,
      );
      return Ok(());
    }
  };

  let manager = songbird::get(ctx)
    .await
    .expect("Songbird Voice client placed in at initialisation.");

  match player::play(&sound, guild_id, manager, &ctx.into()).await {
    Ok(info) => {
      let mut output = format!(
        ":fast_forward: Playing sound file `{}` | ",
        path.to_string_lossy()
      );
      if let Some(volume) = info.volume {
        output += &format!(
          "max_volume: {} dB, mean_volume: {} dB, automatic ",
          volume.max_volume, volume.mean_volume
        );
      } else {
        output += "manual ";
      }
      output += &format!("adjustment {} dB", info.volume_adjustment);
      check_msg(msg.channel_id.say(&ctx.http, output).await);
    }
    Err(err) => {
      match err {
        PlayError::FailedToJoinChannel => check_msg(
          msg
            .channel_id
            .say(
              &ctx.http,
              ":x: Failed to automatically join a voice channel",
            )
            .await,
        ),
        PlayError::AnalysisFailed => check_msg(
          msg
            .channel_id
            .say(&ctx.http, ":x: Failed to analyze sound file")
            .await,
        ),
        PlayError::Decoding(_) => check_msg(
          msg
            .channel_id
            .say(
              &ctx.http,
              ":x: Unknown error playing the sound file. It might me corrupted.",
            )
            .await,
        ),
      };
    }
  };

  Ok(())
}

#[command]
#[only_in(guilds)]
async fn stop(ctx: &Context, msg: &Message) -> CommandResult {
  let guild_id = msg.guild(&ctx.cache).await.unwrap().id;

  let manager = songbird::get(ctx)
    .await
    .expect("Songbird Voice client placed in at initialisation.");

  if player::stop(guild_id, manager).await {
    check_msg(msg.channel_id.say(&ctx.http, ":stop_button: Stopped").await);
  } else {
    check_msg(
      msg
        .channel_id
        .say(&ctx.http, ":x: Not in a voice channel to play in")
        .await,
    );
  }

  Ok(())
}

#[command]
async fn list(ctx: &Context, msg: &Message) -> CommandResult {
  let mut output = match file_handling::get_sounds().await.ok().map(|sounds| {
    sounds
      .into_iter()
      .map(|s| s.file_path.to_string_lossy().to_string())
      .collect::<Vec<_>>()
  }) {
    Some(sounds) => sounds,
    None => {
      check_msg(
        msg
          .channel_id
          .say(&ctx.http, ":x: Failed to list sound files")
          .await,
      );
      return Ok(());
    }
  };

  output.sort();
  output.insert(0, "Available sounds:\n```".to_string());
  output.push("```".to_string());

  check_msg(msg.channel_id.say(&ctx.http, output.join("\n")).await);

  Ok(())
}

#[command]
#[only_in(guilds)]
async fn record(ctx: &Context, msg: &Message) -> CommandResult {
  let reaction = msg
    .react(&ctx.http, ReactionType::try_from("⏬").unwrap())
    .await;

  let guild_id = msg.guild(&ctx.cache).await.unwrap().id;
  let recorder = recorder::get(ctx)
    .await
    .expect("Recorder placed in at initialization");

  match recorder.save_recording(guild_id, &ctx.into()).await {
    Ok(_) => check_msg(
      msg
        .channel_id
        .say(&ctx.http, ":white_check_mark: Recording saved")
        .await,
    ),
    Err(err) => {
      error!(?err, "Failed to record");
      match err {
        RecordingError::IoError(_) => check_msg(
          msg
            .channel_id
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
  let guild_id = msg.guild(&ctx.cache).await.unwrap().id;

  check_msg(
    msg
      .channel_id
      .say(&ctx.http, format!("GuildId: `{}`", guild_id))
      .await,
  );

  Ok(())
}

#[command]
async fn version(ctx: &Context, msg: &Message) -> CommandResult {
  let mut resp = format!(
    "[discord-soundboard-bot](https://github.com/dominikks/discord-soundboard-bot)\nversion: `{}`",
    VERSION
  );
  if let Some(bid) = BUILD_ID {
    resp += &format!("\nbuild: `{}`", bid);
  }
  if let Some(bt) = BUILD_TIMESTAMP {
    resp += &format!("\ntimestamp: `{}`", bt);
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
