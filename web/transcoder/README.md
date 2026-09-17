# Salad transcoder worker

Run `node transcoder/worker.mjs` in the Salad Job Queue container and configure the
queue connection to `POST /jobs` on `$PORT` (health check: `GET /health`). The image
must provide FFmpeg and the licensed DoveRunner CLI packager; override their paths
with `FFMPEG_BIN` and `DOVERUNNER_PACKAGER_BIN` when they are not on `PATH`.

Install only server-side values in the container: AWS credentials scoped to the
dedicated video bucket, `VIDEO_S3_BUCKET`, `VIDEO_S3_REGION`, `DOVERUNNER_ENC_TOKEN`,
`APPLICATION_ORIGIN`, and `TRANSCODER_CALLBACK_SECRET`. Never bake values into the
image or expose them through Salad job input.

The worker validates the server-owned source/output paths and attempt budget,
acquires an S3 conditional lease for that attempt, transcodes the approved H.264/AAC
ladder without upscaling, packages DASH/Widevine with the distinct DRM Content ID,
uploads to an attempt prefix, promotes verified files to the canonical prefix, and
writes `completion.json` last. Deletion tombstones are checked before compute and
again before publication. A handled processing failure sends an authenticated
`failed` callback and returns 2xx to suppress Salad's extra delivery retries; the
application alone owns the three-attempt budget.

Before enabling the staging Demo, run a ten-minute 1080p fixture and retain
credential-free timestamps proving dispatch within 30 seconds and readiness within
15 minutes. Also interrupt one worker attempt, delete an in-flight asset, and verify
retry, tombstone, callback replay, and attempt-prefix cleanup behavior.
