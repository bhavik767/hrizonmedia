# Dedicated Salad worker image. Build with web/ as the Docker context:
#   docker build --platform linux/amd64 -f transcoder/Dockerfile -t <image> .

FROM golang:1.25-bookworm AS queue-worker

# Use the current released queue worker. The previous pinned revision can
# terminate its gRPC job stream with RST_STREAM/INTERNAL_ERROR on Salad.
ARG SALAD_QUEUE_WORKER_REF=v0.7.0

RUN git clone https://github.com/SaladTechnologies/salad-cloud-job-queue-worker.git /src \
  && cd /src \
  && git checkout --detach "$SALAD_QUEUE_WORKER_REF" \
  && go build -trimpath -ldflags='-s -w' -o /out/salad-http-job-queue-worker ./cmd/salad-http-job-queue-worker

FROM node:22-bookworm-slim

ARG PALLYCON_PACKAGER_REF=9462c321bb4c5cc32aa6d136563d438d9ee0ac96

ENV NODE_ENV=production \
    PORT=8080 \
    FFMPEG_BIN=/usr/bin/ffmpeg \
    DOVERUNNER_PACKAGER_BIN=/opt/pallycon/bin/Ubuntu/x86_64/doverunner-drm-packager

LABEL org.opencontainers.image.source="https://github.com/bhavik767/hrizonmedia" \
      org.opencontainers.image.description="HrizonMedia staging DRM transcoder worker"

WORKDIR /app

# The packager binary is invoked during the build to make a missing native library
# fail fast. The queue worker and application are both supervised below.
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates curl ffmpeg git tini \
  && rm -rf /var/lib/apt/lists/*

# DoveRunner's current x86_64 packager links against OpenSSL 1.1. Debian 12 no
# longer ships it, so install precisely that compatibility library from Bullseye.
RUN printf '%s\n' 'deb http://deb.debian.org/debian bullseye main' > /etc/apt/sources.list.d/bullseye.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends libssl1.1 \
  && rm -rf /var/lib/apt/lists/*

RUN apt-get update \
  && apt-get install -y --no-install-recommends libc-ares2 \
  && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/inka-pallycon/pallycon-drm-cli-packager.git /opt/pallycon \
  && cd /opt/pallycon \
  && git checkout --detach "$PALLYCON_PACKAGER_REF" \
  && test -f "$DOVERUNNER_PACKAGER_BIN" \
  && chmod 755 "$DOVERUNNER_PACKAGER_BIN" \
  && "$DOVERUNNER_PACKAGER_BIN" --help >/dev/null

COPY package.json package-lock.json ./
# The repository lockfile is currently out of sync with package.json. Keep the
# source lock untouched; this worker needs only runtime dependencies.
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund \
  && npm cache clean --force

COPY transcoder/ ./transcoder/
COPY --from=queue-worker /out/salad-http-job-queue-worker /usr/local/bin/salad-http-job-queue-worker
COPY transcoder/entrypoint.sh /usr/local/bin/hrizon-transcoder-entrypoint

RUN chmod 755 /usr/local/bin/salad-http-job-queue-worker /usr/local/bin/hrizon-transcoder-entrypoint \
  && useradd --create-home --uid 10001 worker

USER worker

EXPOSE 8080

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/hrizon-transcoder-entrypoint"]
