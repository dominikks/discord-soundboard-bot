############################################################
### Stage 1: Build
FROM clux/muslrust:stable AS builder
WORKDIR /app

# Install cmake for audiopus_sys bundled opus build
RUN apt-get update && \
  apt-get install -y cmake --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

# Allow cmake 4.0+ to build projects that use cmake_minimum_required < 3.5
ENV CMAKE_POLICY_VERSION_MINIMUM=3.5

# libopus (built from source by audiopus_sys) uses sqrtf/log10 from libm.
# musl does not auto-link libm, so explicitly pass -lm to the linker.
ENV RUSTFLAGS="-C link-arg=-lm"

### Dep caching start
COPY backend/Cargo.toml backend/Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs

RUN cargo build --release
### Dep caching end

# Not declared earlier for caching
ARG BUILD_ID
ARG BUILD_TIMESTAMP

COPY backend/ .
RUN touch src/main.rs
RUN cargo build --release

############################################################
### Stage 2: Compose
FROM debian:13-slim AS composer

# Get ffmpeg
RUN apt-get update && apt-get install -y curl tar xz-utils \
  && apt-get clean \
  && curl -L -# --compressed -A 'https://github.com/dominikks/discord-soundboard-bot' -o linux-x64.tar.xz 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz' \
  && tar -x -C /usr/bin --strip-components 1 -f linux-x64.tar.xz --wildcards '*/ffmpeg' '*/ffprobe' \
  && tar -x -f linux-x64.tar.xz --ignore-case --wildcards -O '**/GPLv3.txt' > /usr/bin/ffmpeg.LICENSE

RUN groupadd --gid 1000 discordbot \
  && useradd -u 1000 --system --gid 1000 --no-create-home discordbot \
  && mkdir -p /app/data/sounds \
  && mkdir -p /app/data/recorder \
  && chown -R discordbot:discordbot /app

COPY --chown=discordbot:discordbot --from=builder /app/target/x86_64-unknown-linux-musl/release/discord-soundboard-bot /app/Rocket.toml /app/
COPY --chown=discordbot:discordbot frontend/dist/discord-soundboard-bot/browser frontend/dist/discord-soundboard-bot/3rdpartylicenses.txt /app/static/

############################################################
### Stage 3: Final image
FROM gcr.io/distroless/cc-debian12
LABEL maintainer="dominik@kus.software"

COPY --from=composer /etc/passwd /etc/
COPY --from=composer /usr/bin/ffmpeg /usr/bin/ffprobe /usr/bin/
COPY --from=composer --chown=1000:1000 /app /app

USER discordbot
WORKDIR /app
VOLUME /app/data/sounds
VOLUME /app/data/recorder

EXPOSE 8000
ENV RUST_LOG=info
CMD ["/app/discord-soundboard-bot"]