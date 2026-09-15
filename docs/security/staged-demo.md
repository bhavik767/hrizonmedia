# Staged Demo security boundary

The Demo uses deterministic, server-only fake adapters. It is not evidence of real
DRM or provider security. An optimized Railway staging deployment may use the
fakes; an enabled production Demo is rejected at startup until verified real
adapters replace them. Both the Docker entrypoint and `npm run start` run the
environment validator. Production requires an HTTPS `NEXT_PUBLIC_SERVER_URL` and
the database, private CMS bucket, Payload, and callback configuration listed in
`web/.env.example`. Never put secret values in `NEXT_PUBLIC_*` variables.

## Transcoder callbacks

POST `/api/internal/transcode/callback` with a JSON object containing:

- `callbackId`: a unique event identifier (1–128 letters, digits, `.`, `_`, `:`, or `-`).
- `providerJobId`: the known job identifier returned by the provider.
- `outputPrefix`: exactly `outputs/{processingJobId}/`, supplied when dispatching the job.
- `status`: `ready` or `failed`.

`x-hrizon-timestamp` is Unix time in milliseconds, within five minutes of the
server clock. `x-hrizon-signature` is the canonical unpadded base64url encoding of
HMAC-SHA256 over `{timestamp}.{raw JSON body}`, keyed by
`TRANSCODER_CALLBACK_SECRET`. Bodies are stream-bounded to 16 KiB.

An identical current, authenticated event is acknowledged with 204 without a
second state change or Audit Event. Reusing its ID for different content returns
409. Expired or tampered authentication, unknown jobs, invalid state transitions,
and noncanonical or escaping output prefixes are rejected.

## Browser mutations

Demo routes and server actions check browser origins and rate-limit mutations.
Payload CORS/CSRF origins are restricted to the application origin. Pilot Member
cookies use HttpOnly (Payload), SameSite=Strict, and Secure in production mode.
Authenticated Demo responses are non-cacheable and use `nosniff`.

The process-local one-minute limits are 30 general mutations per member, 600
part-target requests, 600 part-content requests, and 120 licence requests.
Unauthenticated sign-in/setup actions share a 30-request bucket, supplemented by
Payload's per-identity login lockout. These limits assume one staging application
process; multiple replicas need a shared limiter before production enablement.

JSON mutation bodies default to 16 KiB; completion manifests allow 128 KiB and up
to 410 validated parts for the supported 2 GiB upload limit. Proxied fake upload
parts are capped at 5 MiB and licence challenges at 64 KiB. Readers cancel streams
as soon as their limit is crossed, including undeclared/chunked requests.

Unexpected failures and storage-validation errors expose fixed messages, not raw
provider exceptions. Provider cleanup/callback logs contain fixed diagnostics
without credentials, signatures, challenges, or exception bodies.

## Verification

Route/Payload integration tests cover callback freshness/integrity, event replay
binding, prefix escapes, token canonicalization, body limits, rate limits,
credential-safe failures, cross-member rules, and startup configuration.
Playwright covers hostile origins and authenticated cross-member denial against
the running application, alongside the existing upload/playback/lifecycle flows.
