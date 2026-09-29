# Salad transcoder worker

Run `node transcoder/worker.mjs` in the Salad Job Queue container and configure the
queue connection to `POST /jobs` on `$PORT` (health check: `GET /health`). The image
must provide FFmpeg and the licensed DoveRunner CLI packager; override their paths
with `FFMPEG_BIN` and `DOVERUNNER_PACKAGER_BIN` when they are not on `PATH`.

Build `transcoder/Dockerfile` from the `web/` directory. It pins the Linux/amd64 base
image digests, snapshot date, Salad queue worker, DoveRunner packager, vetted FFmpeg
package, and native libraries into the image; it does not install executables when a
Processing Job starts. Publish the resulting image and configure Salad with its
immutable image digest, rather than a mutable tag.

Install only server-side values in the container: AWS credentials scoped to the
dedicated video bucket, `VIDEO_S3_BUCKET`, `VIDEO_S3_REGION`, `DOVERUNNER_ENC_TOKEN`,
`APPLICATION_ORIGIN`, and `TRANSCODER_CALLBACK_SECRET`. Never bake values into the
image or expose them through Salad job input.

The worker validates the server-owned source/output paths and attempt budget,
acquires an S3 conditional lease for that attempt, transcodes the approved H.264/AAC
ladder without upscaling, packages DASH/CENC for Widevine and HLS/CBCS for FairPlay with the distinct DRM Content ID,
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
   autoscaler, probes, and **one desired replica**. Keep `min_replicas` at one for
   the staging Demo and `max_replicas` within the application concurrency limit.
   Scale-to-zero is not an acceptable interactive-upload baseline: the 29 September
   2026 incident spent 298 seconds waiting for a worker before 72 seconds of actual
   processing.
2. Wait for one instance to report `running`, `started: true`, and `ready: true`.
   Image download and allocation may take several minutes and are separate from the
   parent group's lifecycle status.
3. Submit a credential-free sentinel job whose deliberately invalid input is rejected
   by `validateJob`. It must leave `pending`; `failed` proves Salad routed the request
   to this worker without touching S3, DoveRunner, or the application database.
4. Leave one instance warm, submit a real fixture, and prove the job starts within
   30 seconds. A deliberate scale-to-zero test may be run separately to measure cold
   allocation, but restore and verify `replicas: 1`, `min_replicas: 1`, and one
   `running`/`ready` instance before accepting uploads.

Run the credential-free image proof before creating or updating a Salad group:

```
npm run test:transcoder:smoke -- hrizonmedia-transcoder:issue-127
```

It builds the worker image, verifies both baked executables, confirms the queue worker
is running, starts its normal entrypoint, confirms `GET /health`, and submits the
invalid sentinel to `POST /jobs`. The sentinel returns `503` before the worker reads a
Media Asset, connects to storage, or invokes a transcoding executable. Run the
queue-delivered sentinel in step 3 above as the separate Salad control-plane proof;
this local image test does not replace it.

Treat `GET /queues/{queue_name}` container-group membership as diagnostic metadata,
not the sole readiness gate. During the 2026-09 staging bootstrap it lagged behind a
ready instance that was demonstrably receiving jobs. The functional delivery probe,
instance readiness, and a real encrypted output are the authoritative gates.

Deleting a broken group is asynchronous. A subsequent `GET` can return 404 while
creation with the same name still returns `name_conflict`; either wait for the provider
tombstone to clear or use an explicitly approved replacement name. Salad API responses
may echo container environment values, so never print create/update responses and
rotate any worker secret that has appeared in captured output.
