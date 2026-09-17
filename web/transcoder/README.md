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

## Salad staging bootstrap

Do not start a newly created queue-backed container group at zero replicas. Salad can
accept and start that definition while leaving the group in `deploying` with no
instances, which provides no functional proof that the image, probes, or queue route
work. Bootstrap staging with this sequence instead:

1. Create the group through the public API with its `queue_connection`, queue
   autoscaler, probes, and **one desired replica**. Keep the autoscaler's eventual
   `min_replicas` at zero and `max_replicas` within the application concurrency limit.
2. Wait for one instance to report `running`, `started: true`, and `ready: true`.
   Image download and allocation may take several minutes and are separate from the
   parent group's lifecycle status.
3. Submit a credential-free sentinel job whose deliberately invalid input is rejected
   by `validateJob`. It must leave `pending`; `failed` proves Salad routed the request
   to this worker without touching S3, DoveRunner, or the application database.
4. Only after the sentinel is delivered may the group scale to zero. Then submit a
   real fixture and prove that queue depth causes a cold worker to become ready and
   process it.

Treat `GET /queues/{queue_name}` container-group membership as diagnostic metadata,
not the sole readiness gate. During the 2026-09 staging bootstrap it lagged behind a
ready instance that was demonstrably receiving jobs. The functional delivery probe,
instance readiness, and a real encrypted output are the authoritative gates.

Deleting a broken group is asynchronous. A subsequent `GET` can return 404 while
creation with the same name still returns `name_conflict`; either wait for the provider
tombstone to clear or use an explicitly approved replacement name. Salad API responses
may echo container environment values, so never print create/update responses and
rotate any worker secret that has appeared in captured output.
