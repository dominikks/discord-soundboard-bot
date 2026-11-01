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

### Validation

Use Node 24, stable Rust, Chrome/Chromium, CMake and FFmpeg. Backend tests require a
**disposable PostgreSQL database**: they run migrations and truncate their application tables.
They exercise actual Rocket routes, encrypted sessions, command tokens, sound CRUD and
MP3 upload/download, permission boundaries and disconnected playback. Discord data is
cached locally and unexpected HTTP requests are directed to localhost, not Discord.

```sh
cd backend
TEST_DATABASE_URL=postgres://postgres:password@localhost/soundboard_test \
  CMAKE_POLICY_VERSION_MINIMUM=3.5 cargo test --locked
cargo fmt --all -- --check
CMAKE_POLICY_VERSION_MINIMUM=3.5 cargo clippy --locked --all-targets -- -D warnings
cd ../frontend
npm ci
npm run test:ci
npm run build
npm run lint
npm run format:check
cd ..
node --test .github/scripts/dependabot.test.cjs
node .github/scripts/artifact-smoke.cjs frontend/dist/discord-soundboard-bot/browser
node .github/scripts/browser-smoke.cjs frontend/dist/discord-soundboard-bot/browser
```

Set `CHROME_BIN` if Chrome is not found automatically. Angular tests cover rendered
play/preview/stop controls, HTTP request payloads, authentication errors and routed
session/guild permissions. CI also builds the deployable Docker image without registry
credentials and checks packaged FFmpeg/FFprobe and production frontend assets.
The packaged Angular bundles also boot in headless Chrome against fixture API responses
and must navigate from the soundboard deep link to the real login screen.
Bot startup itself requires real Discord credentials and is not simulated by this smoke check.
Registry publication remains limited to main/development pushes, tags and explicit
trusted-branch dispatches.

### Weekly dependency updates

Dependabot checks Cargo, frontend npm, GitHub Actions and Docker every Monday at 06:00
Europe/Berlin. Existing Docker versions are digest-pinned so floating-tag changes are
trackable; coordinated Angular packages update together. Major updates are not blanket
ignored: incompatible versions stay unmerged until their peer/API incompatibilities are fixed.

The trusted `workflow_run` merger considers only open, non-draft, same-repository
Dependabot PRs targeting the default branch. It waits for the latest attempt of **all
three** validation workflows on the exact PR head, checks named jobs and revalidates
the head/runs before requesting native squash auto-merge. Stale/cancelled/nonbot runs
are ignored. Failed validation or merge requests assign `dominikks` only if not already
assigned; PRs are not assigned on creation. No PR checkout or artifacts are executed
in the privileged merger.

Repository setup (not changed by this PR):

- Enable native repository auto-merge. Disable that setting or the `Dependabot auto-merge`
  workflow to stop automation; no custom enable variable is needed.
- Protect the default branch using an **active branch ruleset** with required GitHub
  Actions checks **Compile frontend**,
  **Build docker image**, **Lint frontend**, **Lint backend**, **Backend behavior**,
  **Frontend behavior**, and **Auto-merge policy**, and require branches to be up to date.
  The merger fails closed without this active, strict rule. Classic branch protection
  also works when readable by the built-in token; prefer a ruleset because its active
  branch rules can be checked without Administration permission.
- Provide `DEPENDABOT_MERGE_TOKEN`, a fine-grained token restricted to this repository
  with **Contents: read/write** and **Pull requests: read/write**. It is used only for
  `gh pr merge --auto --squash --match-head-commit`, allowing the resulting merge to
  trigger normal image publication. Validation and failure assignment use the built-in
  token with read access and `pull-requests: write`, not `issues: write`.
