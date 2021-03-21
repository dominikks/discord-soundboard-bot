############################################################
### Stage 1: Build
FROM clux/muslrust:nightly-2021-03-15 as builder
WORKDIR /app

# Statically link libopus
ARG LIBOPUS_STATIC=1

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
FROM debian:stable-slim as composer

# Get ffmpeg
RUN apt-get update && apt-get install -y curl tar xz-utils \
  && apt-get clean \
  && curl -L -# --compressed -A 'https://github.com/dominikks/discord-soundboard-bot' -o linux-x64.tar.xz 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz' \
  && tar -x -C /usr/bin --strip-components 1 -f linux-x64.tar.xz --wildcards '*/ffmpeg' '*/ffprobe' \
  && tar -x -f linux-x64.tar.xz --ignore-case --wildcards -O '**/GPLv3.txt' > /usr/bin/ffmpeg.LICENSE

RUN addgroup --gid 1000 discordbot \
  && adduser -u 1000 --system --gid 1000 discordbot \
  && mkdir -p /app/data/sounds \
  && mkdir -p /app/data/recorder \
  && chown -R discordbot:discordbot /app

COPY --chown=discordbot:discordbot --from=builder /app/target/x86_64-unknown-linux-musl/release/discord-soundboard-bot /app/Rocket.toml /app/
ADD --chown=discordbot:discordbot frontend/dist/discord-soundboard-bot /app/frontend

############################################################
### Stage 3: Final image
FROM gcr.io/distroless/cc
LABEL maintainer="dominik@kdtk.de"

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