# Issue #45: DoveRunner DRM verification gate

Status: **implementation complete; real-provider verification and Multi-DRM claim gate remain closed**.
Updated: 2026-09-17. Source: [issue #45](https://github.com/bhavik767/hrizonmedia/issues/45).

The application now uses the DoveRunner token-proxy path when, and only when, the
complete real provider configuration is present. The browser sends its Widevine
challenge to HrizonMedia's authenticated licence route. That route rechecks the
five-minute, owner-scoped Playback Grant before the server creates a just-in-time
DoveRunner token for the exact DRM Content ID and returns DoveRunner's raw licence.

The browser never receives the DoveRunner site key, access key, encryption token,
or provider token. The provider token uses the nonpersistent streaming policy
`{ policy_version: 2, playback_policy: { persistent: false, license_duration: 0 } }`.
The five-minute application grant limits new licence acquisition; it does not cut
off a nonpersistent playback session already issued by Widevine.

## Required non-secret Railway configuration

The staging web service needs `DOVERUNNER_SITE_ID`, `DOVERUNNER_SITE_KEY`, and
`DOVERUNNER_ACCESS_KEY`, alongside the existing real S3, CloudFront, and Salad
variables. `DOVERUNNER_ENC_TOKEN` remains exclusive to the Salad worker. The
provider factory fails closed when any required real-provider variable is missing;
it never falls back to deterministic providers in production.

## Evidence still required before closing the gate

Do not store credentials, licence challenges, licence bodies, or provider tokens
in this repository, issue tracker, screenshots, or logs. An authorized operator
must record only the following non-secret results:

- rotation or revocation of the previously embedded DoveRunner credentials, with
  the affected credential identifiers and time recorded outside the repository;
- DoveRunner's staging console showing a 300-second provider-token lifetime for
  the rotated staging site;
- a staging package run whose DASH manifest has Widevine CENC protection for a
  unique `drm_{processingJobId}` Content ID;
- Chrome and Edge playback from the private CloudFront delivery path, including
  successful Widevine licence acquisition and playback after delivery-signature
  refresh;
- denials for expired grants, copied grants, another Pilot Member, deleted or
  expired Media Assets, offline playback, and persistent-licence attempts;
- separate representative FairPlay and PlayReady verification. Until both pass,
  the product must not claim Multi-DRM support.

Any failed ecosystem keeps the claim gate closed. The repository's current public
copy names only Widevine streaming and makes no Multi-DRM claim.
