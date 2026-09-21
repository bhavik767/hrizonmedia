# Issue #76: PlayReady verification gate

## Release status

The application now selects `com.microsoft.playready` only when a Microsoft Edge browser
reports that its PlayReady EME key system is available. It returns the DASH/CENC Playback
Grant contract and proxies the licence challenge through the application with a freshly
signed, non-persistent DoveRunner token. This document is not evidence that a provider
licence exchange or device playback has happened.

Do not claim PlayReady support, or tick issue #76's provider-verification acceptance
criterion, until the release evidence below is recorded for the deployed revision.

## Required real-provider evidence

Use a supported Windows device and current stable Microsoft Edge. Record the deployment
URL, immutable application revision, UTC timestamp, Windows version, Edge version, and
whether the device's PlayReady capability is hardware- or software-backed where the
platform reports it.

1. Upload and process a new protected Media Asset using the real DoveRunner worker. Retain
   the private output's DASH manifest evidence showing both CENC `ContentProtection` system
   IDs: Widevine `edef8ba9-79d6-4ace-a3c8-27dcd51d21ed` and PlayReady
   `9a04f079-9840-4286-ab92-e65be0885f95`.
2. Start playback in Edge. Capture the Playback Grant response showing
   `keySystem: "com.microsoft.playready"`, `manifestFormat: "dash"`, and
   `hdcpRequired: false`; do not retain the Playback Grant token in the evidence bundle.
3. Capture the successful application licence request and a successful DoveRunner licence
   transaction for the same request time. Confirm browser network data contains no
   DoveRunner access key, site key, encryption token, or provider licence token.
4. Confirm encrypted DASH playback renders video and audio. Inspect the resulting MediaKey
   session only enough to establish it is temporary; do not attempt persistent or offline
   licence acquisition.
5. Repeat the licence and delivery requests with an expired grant, a grant for another
   Media Asset, and a guessed route ID. Record the expected authorization failures and
   confirm that none return clear media.

## Evidence record

| Field | Required value |
| --- | --- |
| Deployed revision | Pending |
| UTC verification time | Pending |
| Windows and Edge versions | Pending |
| Device PlayReady capability | Pending |
| DASH/CENC multi-DRM manifest evidence | Pending |
| PlayReady grant and licence exchange evidence | Pending |
| Temporary-session evidence | Pending |
| Expired/cross-asset/guessed denial evidence | Pending |
| Verifier | Pending |

The automated contract and end-to-end tests exercise selection and authorization against
the deterministic adapter. They cannot substitute for this real provider/device evidence.
