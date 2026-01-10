![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/dominikks/discord-soundboard-bot/build.yaml?branch=main)
![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/dominikks/discord-soundboard-bot)
![GitHub](https://img.shields.io/github/license/dominikks/discord-soundboard-bot)

# discord-soundboard-bot

A soundboard for discord! Try it out at [floomer.app](https://floomer.app).

## Features

- 📢 Play custom sounds in a voice channel
  - Sounds can be played via the website or auto-generated [AutoHotkey](https://www.autohotkey.com/) scripts
- ⏹ Record the last 60 seconds of voice activity (like Shadowplay, but for Discord)

## Screenshots

<img src="doc/images/screenshots/dashboard.png" />
<img src="doc/images/screenshots/guild-settings.png" />
<img src="doc/images/screenshots/guild-sounds.png" />

## Usage

You can control the bot via the web page. Also, the following chat commands are available.

- `~join`: The bot joins the voice channel you are currently in.
- `~leave`
- `~stop`: Stops playback.
- `~info`: Prints information about the app (version, link to webpage, ...).
- `~record`: Records the last 60 seconds of voice activity and saves them in the recordings folder.
- `~guildid`: Prints the id of your discord server.

To issue a command, you must mention the bot in the message (e.g. `~join @my_bot_name`).

## Self-hosting

The app is deployed via Docker. The Docker container can be configured using environment variables. Sound files and
recordings are stored in volumes. For details, see the next sections.

The http webserver is exposed under port `8000`. When deploying, a reverse proxy may be used for https and optionally
Gzip/Brotli compression (e.g. traefik, nginx, ...).

### Prerequisites

To deploy, you need to create an application in the
[Discord Developer Portal](https://discord.com/developers/applications) under which your bot will run:

1. Go to the portal and add an application. Here, you can also set the username and profile picture of your bot.
2. Save the Client ID and Client Secret from the "General Information" tab for later.
3. Go to OAuth2 and add a URL of the following form: `https://soundboard.domain/api/auth/login` where
   `soundboard.domain` is the hostname under which your server should run.
4. Go to Bot, create a Bot and save the Bot token. Also check the box "Server Members Intent" under "Privileged Gateway
   Intents". This is required to validate user permissions.

### Deploying

To run the app, create a docker-compose file:

```
services:
  soundboard:
    image: ghcr.io/dominikks/discord-soundboard-bot
    ports:
      - "8000:8000"
    environment:
      - DISCORD_TOKEN=<bottoken>
      - DISCORD_CLIENT_ID=<clientid>
      - DISCORD_CLIENT_SECRET=<clientsecret>
      - ROCKET_SECRET_KEY=<secretkey>
      - ROCKET_DATABASES={postgres_database={url="postgres://postgres:<dbpassword>@db/postgres"}}
      - BASE_URL=<url>
    volumes:
      - sounds:/app/data/sounds
      - recordings:/app/data/recordings

  db:
    image: postgres
    environment:
      - POSTGRES_PASSWORD=<dbpassword>
    volumes:
      - db:/var/lib/postgresql/data

volumes:
  sounds:
  recordings:
  db:
```

The values from the Discord Developer Portal need to be passed to the bot via environment variables. The secret key
should be randomly generated, for example with `openssl rand -base64 32`. It is used to encrypt cookies stored on the
client. You can set the database password yourself. For details on the other values, see the table below.

Run the app via `docker compose up -d`. Stop via `docker compose down`.

The website should now be up, so that you can add the bot to your Discord server.

### Configuration

| Environment Variable  | Meaning                                                                                                                                                                      | Example                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| DISCORD_TOKEN         | **Required.** Can be obtained in the Discord developer portal. Should be kept private.                                                                                       | `ABCDE...dg`                   |
| DISCORD_CLIENT_ID     | **Required.** Can be obtained in the Discord developer portal.                                                                                                               | `ABCDE...dg`                   |
| DISCORD_CLIENT_SECRET | **Required.** Can be obtained in the Discord developer portal. Should be kept private.                                                                                       | `ABCDE...dg`                   |
| BASE_URL              | **Required.** The URL under which the app is reachable. Must not end with a slash.                                                                                           | `https://soundboard.domain`    |
| ROCKET_SECRET_KEY     | **Required.** A random key with which private cookies are encrypted that are placed on the client. Can be generated with `openssl rand -base64 32`.                          | `hdjskfhs...dfkij=`            |
| LEGAL_URL             | A url which is added as a link in the website footer. Can be used to link to a page containing legal information (e.g. privacy policy).                                      | `https://my.website/legal`     |
| RECORDING_LENGTH      | The length in seconds for a recording using the built-in discord recorder. Defaults to 60.                                                                                   | `30`                           |
| RUST_LOG              | Configure logging for the application. Defaults to `info`. For more details, see [here](https://docs.rs/tracing-subscriber/0.2.15/tracing_subscriber/struct.EnvFilter.html). | `discord_soundboard_bot=debug` |

### Docker Volumes

| Volume               | Explanation                                             |
| -------------------- | ------------------------------------------------------- |
| `/app/data/sounds`   | Sounds are saved here.                                  |
| `/app/data/recorder` | Contains recordings made by the sound-recorder feature. |

By default, the app runs with UID 1000, so make sure that if you mount folders, they are owned by a user with that UID
(e.g. `chown 1000 <folder>`).

## Development

You need to have the latest Rust toolchain, Node, Docker and Docker Compose installed. Furthermore, `ffmpeg`,
`libpq-dev`, `cmake` and `pkg-config` need to be installed.

Then, create a `.env` file in the main project folder:

```
cat > .env <<'EOF'
DISCORD_TOKEN=<token>
DISCORD_CLIENT_ID=<clientid>
DISCORD_CLIENT_SECRET=<clientsecret>
BASE_URL=http://localhost:4200
RUST_LOG=discord_soundboard_bot=TRACE
POSTGRES_PASSWORD=<postgrespassword>
ROCKET_DATABASES={postgres_database={url=postgres://postgres:<postgrespassword>@localhost/postgres}}
EOF
```

Set the env variables `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` and `BASE_URL` as described under
[Configuration](#configuration). Finally, you can start the service locally as follows:

- Start the dev sandbox using `docker compose up -d`.
- Start the backend using `cargo run` in `backend/`.
- Start the frontend using `npm start` in `frontend/`. The proxy will pass api requests data to the backend (see
  `proxy.config.js`).
- Access the frontend server under [http://localhost:4200](http://localhost:4200).

### Testing

The backend includes comprehensive unit tests for core functionality. Run tests using:

```bash
cd backend
cargo test
```

**Test Coverage:**
- ✅ Volume calculation and dB conversion (`audio_utils.rs`)
- ✅ Recording timeline math and gap calculations (`discord/recorder.rs`)
- ✅ File path handling and sanitization (`file_handling.rs`)

For detailed information about the testing strategy, see [TESTING.md](TESTING.md).

**CI/CD:** Tests are automatically run on all pull requests via GitHub Actions.
