FROM debian:stable-slim as composer

# Install ffmpeg
RUN apt-get update && apt-get install -y curl tar xz-utils libopus0 \
  && curl -L -# --compressed -o linux-x64.tar.xz 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz' \
  && tar -x -C /usr/bin --strip-components 1 -f linux-x64.tar.xz --wildcards '*/ffmpeg' '*/ffprobe' \
  && tar -x -f linux-x64.tar.xz --ignore-case --wildcards -O '**/GPLv3.txt' > /usr/bin/ffmpeg.LICENSE

# Add soundboard files
RUN addgroup --gid 1000 discordbot \
  && adduser -u 1000 --system --gid 1000 discordbot \
  && mkdir -p /app/data/sounds \
  && mkdir -p /app/data/recorder \
  && chown -R discordbot:discordbot /app

ADD --chown=discordbot:discordbot backend/target/release/discord-soundboard-bot backend/Rocket.toml /app/
ADD --chown=discordbot:discordbot frontend/dist/discord-soundboard-bot /app/frontend
RUN chmod +x /app/discord-soundboard-bot

# Build image
FROM gcr.io/distroless/cc
LABEL maintainer="dominik@kdtk.de"

COPY --from=composer /etc/passwd /etc/
COPY --from=composer /usr/bin/ffmpeg /usr/bin/ffprobe /usr/bin/
COPY --from=composer /usr/lib/x86_64-linux-gnu/libopus.so.0 /usr/lib/x86_64-linux-gnu/
COPY --from=composer --chown=1000:1000 /app /app

USER discordbot
WORKDIR /app
VOLUME /app/data/sounds
VOLUME /app/data/recorder

EXPOSE 8000
ENV RUST_LOG=info
CMD ["/app/discord-soundboard-bot"]