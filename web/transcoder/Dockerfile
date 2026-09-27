# Dedicated Salad worker image. Build with web/ as the Docker context:
#   docker build --platform linux/amd64 -f transcoder/Dockerfile -t <image> .

FROM golang:1.25-bookworm@sha256:c268a04d59aea0b180ed9946a658cfab9e7b3391dc90eed6e4969ccff98c851f AS queue-worker

# v0.7.0, pinned to its source revision so a moved tag cannot change a release.
ARG SALAD_QUEUE_WORKER_REF=b788070320afda986fb58a281b9f8ecfd4ef8b3d

RUN git init /src \
  && cd /src \
  && git remote add origin https://github.com/SaladTechnologies/salad-cloud-job-queue-worker.git \
  && git fetch --depth 1 origin "$SALAD_QUEUE_WORKER_REF" \
  && git checkout --detach FETCH_HEAD \
  && go build -trimpath -ldflags='-s -w' -o /out/salad-http-job-queue-worker ./cmd/salad-http-job-queue-worker

FROM node:22-bookworm-slim@sha256:25330af3531fb5e23318554a0aa911125b6e91b1b777edf7655501d207c067a2 AS packager-source

# This is the vetted DoveRunner packager source revision.
ARG PALLYCON_PACKAGER_REF=9462c321bb4c5cc32aa6d136563d438d9ee0ac96
ARG DEBIAN_SNAPSHOT=20250101T000000Z

RUN printf '%s\n' "deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT} bookworm main" > /etc/apt/sources.list \
  && rm -f /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/* \
  && git init /opt/pallycon \
  && cd /opt/pallycon \
  && git remote add origin https://github.com/inka-pallycon/pallycon-drm-cli-packager.git \
  && git fetch --depth 1 origin "$PALLYCON_PACKAGER_REF" \
  && git checkout --detach FETCH_HEAD \
  && rm -rf .git

FROM node:22-bookworm-slim@sha256:25330af3531fb5e23318554a0aa911125b6e91b1b777edf7655501d207c067a2

ARG DEBIAN_SNAPSHOT=20250101T000000Z

ENV NODE_ENV=production \
    PORT=8080 \
    FFMPEG_BIN=/usr/bin/ffmpeg \
    DOVERUNNER_PACKAGER_BIN=/opt/pallycon/bin/Ubuntu/x86_64/doverunner-drm-packager

LABEL org.opencontainers.image.source="https://github.com/bhavik767/hrizonmedia" \
      org.opencontainers.image.description="HrizonMedia staging DRM transcoder worker"

WORKDIR /app

# The packager binary is invoked during the build to make a missing native library
# fail fast. The queue worker and application are both supervised below.
RUN printf '%s\n' "deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT} bookworm main" > /etc/apt/sources.list \
  && rm -f /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates curl ffmpeg tini \
  && rm -rf /var/lib/apt/lists/*

# DoveRunner's current x86_64 packager links against OpenSSL 1.1. Debian 12 no
# longer ships it, so install precisely that compatibility library from Bullseye.
RUN printf '%s\n' "deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT} bullseye main" > /etc/apt/sources.list.d/bullseye.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends libssl1.1 \
  && rm -rf /var/lib/apt/lists/*

RUN apt-get update \
  && apt-get install -y --no-install-recommends libc-ares2 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=packager-source /opt/pallycon /opt/pallycon

RUN test -x "$FFMPEG_BIN" \
  && "$FFMPEG_BIN" -version >/dev/null \
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
