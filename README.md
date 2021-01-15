![GitHub Workflow Status](https://img.shields.io/github/workflow/status/dominikks/discord-soundboard-bot/Build%20app)
![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/dominikks/discord-soundboard-bot)
![GitHub](https://img.shields.io/github/license/dominikks/discord-soundboard-bot)

# discord-soundboard-bot

A soundboard for discord!

## Features

- 📢 Play custom sounds in a voice channel
  - Sounds can be played via the website, auto-generated [AutoHotkey](https://www.autohotkey.com/) scripts or chat commands
- ⏹ Record the last 60 seconds of voice activity (like Shadowplay, but for Discord)

## Installation

The docker container can be configured using environment variables.
The sound files are stored in volumes.
For details, see the next sections.

The http webserver is exposed under port `8000`.
When deploying, a reverse proxy may be used for https and optionally Gzip/Brotli compression (e.g. traefik, nginx, ...).

To deploy, you need to get a Bot token from the [Discord Developer Portal](https://discord.com/developers/applications).
To get one, go to the portal, add an application, go to the bot tab, create a bot and copy the token.
Then, you can run the bot:

```
docker run -p 8000:8000 -e DISCORD_TOKEN=<token> -v ./sounds:/app/data/sounds -v ./recordings:/app/data/recordings ghcr.io/dominikks/discord-soundboard-bot
```

By default, the app runs with UID 1000, so make sure the mounted folders are owned by a user with that UID (e.g. `chown 1000 ./sounds && chown 1000 ./recordings`).

To add the bot to your Discord server, you can use the following link.
You can get the client id from the "General Information" tab of your application in the Discord Developer Portal.

```
https://discordapp.com/oauth2/authorize?client_id=<client_id>&scope=bot&permissions=3147776
```

Congratulations!
Your bot is now active in your server and can play your sound files.

### Configuration

| Environment Variable | Meaning                                                                                                                                                                                                                | Example                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| DISCORD_TOKEN        | **Required.** Token for the bot to interact with the Discord APIs. Can be obtained in the Discord developer portal. Should be kept private.                                                                            | `ABCDE...dg`                             |
| APP_TITLE            | Set a custom app title for the webapp. Is displayed before the page title. Defaults to the empty string.                                                                                                               | `My Soundboard`                          |
| FILE_MANAGEMENT_URL  | If you have some web frontend set up to manage your sounds (e.g. [filebrowser](https://github.com/filebrowser/filebrowser)), you can put its URL here. It adds a new menu item on the main page which will link there. | `https://files.soundboard.domain`        |
| RANDOM_INFIXES       | A comma separated list of strings. For each string, a button will be shown in the webapp. When such a button is pressed, a sound which contains the string is randomly chosen and played.                              | `test,mystring,123`                      |
| TARGET_MAX_VOLUME    | Every sound file's volume is amplified so that its maximum volume is at least this value. Defaults to -3.                                                                                                              | `-3`                                     |
| TARGET_MEAN_VOLUME   | Every sound file's volume is amplified so that its mean volume is at least this value. Defaults to -10.                                                                                                                | `-10`                                    |
| BASE_URL             | The URL under which the webserver is reachable. May optionally contain the domain. Must not end with a slash. Defaults to the root (empty string).                                                                     | `https://my.soundboard.domain` or `/api` |
| RUST_LOG             | Configure logging for the application. Defaults to `info`. For more details, see [here](https://docs.rs/tracing-subscriber/0.2.15/tracing_subscriber/struct.EnvFilter.html).                                           | `discord_soundboard_bot=debug`           |

### Volumes

| Volume               | Explanation                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/app/data/sounds`   | Contains the sounds available to the soundboard. The subfolders mark the categories containing the sounds. |
| `/app/data/recorder` | Contains recordings made by the sound-recorder feature.                                                    |

## Usage

You can control the bot via the exposed web page.
Also, the following chat commands are available.

- `~join`: The bot joins the voice channel you are currently in.
- `~leave`
- `~play <soundfile>`: Plays the given soundfile. Example: `~play file.mp3`, `~play folder/file.mp3`.
- `~stop`: Stops playback.
- `~version`: Prints version information.
- `~list`: Lists the available sound files. Beware that this does not work if you have a lot of sounds as Discord imposes a maximum length on chat messages.
- `~record`: Records the last 60 seconds of voice activity and saves them in the recordings folder.
- `~guildid`: Prints the id of your discord server.

## Development

You need to have the latest Rust nightly toolchain installed.
Then, you can start the service locally as follows:

- Start the backend using `DISCORD_TOKEN=... cargo run` in `backend/`.
- Start the frontend using `npm start` in `frontend/`. The proxy will pass api requests data to the backend (see `proxy.config.js`).
- Access the frontend server under [http://localhost:4200](http://localhost:4200).
