# Issue #77: Multi-DRM release verification matrix

Status: **claim gate closed — no real browser/device result has been recorded for this
revision.** Source: [issue #77](https://github.com/bhavik767/hrizonmedia/issues/77).

This is the release record for real encrypted playback, temporary licence exchange,
and protected-output observations. Automated tests and deterministic adapters verify
the application contract; they are not release evidence. A row may be marked verified
only after an authorised operator has supplied the non-secret evidence listed below.

Until then, HrizonMedia makes no real-release browser-coverage, PlayReady-coverage,
or capture-blackout claim. In particular, the application support for selecting a DRM
contract is not evidence that a device completed a provider licence exchange or
rendered encrypted media.

## Release matrix

Use one row for each browser, device, and capture/output path actually exercised.
`Black`, `Blocked`, and `Visible` are the only permitted capture/output observations.
Leave an untested result blank; do not infer it from DRM capability, browser family,
another device, or a deterministic test.

| Browser and device | DRM / encrypted package | Real playback and licence exchange | Capture or external-output path | Observed result | Evidence record |
| --- | --- | --- | --- | --- | --- |
| Chrome desktop — unverified device | Widevine / DASH-CENC | Not recorded | — | — | — |
| Chrome on Android — unverified device | Widevine / DASH-CENC | Not recorded | — | — | — |
| Safari on macOS — unverified device | FairPlay / HLS-CBCS | Not recorded | — | — | — |
| Safari on iOS — unverified device | FairPlay / HLS-CBCS | Not recorded | — | — | — |
| Microsoft Edge on Windows — unverified device | PlayReady / DASH-CENC | Not recorded | — | — | — |

An observed result describes only the named browser, operating-system version, device,
build, DRM implementation, and path. It is not a promise that another recorder,
external display, operating-system update, adapter, or camera capture will behave the
same way.

## Evidence required for a verified row

Record the following in the access-controlled release evidence store, never in this
repository, a ticket comment, a screenshot, or application logs:

1. The staging URL, immutable application revision, UTC verification time, browser and
   operating-system versions, device model, and verifier. Include the DRM security
   level or PlayReady capability only where the platform reports it.
2. A newly processed Media Asset's encrypted manifest evidence: the expected
   DASH-CENC `ContentProtection` entry for Widevine or PlayReady, or the HLS-CBCS
   FairPlay packaging evidence. Record the Media Asset/Processing Job reference without
   publishing a manifest URL or signed query string.
3. A Playback Grant response with the compatible key system, manifest format, and
   `hdcpRequired: false`; redact the Playback Grant token, URLs containing signatures,
   and any member information.
4. A successful application licence request and matching DoveRunner transaction by
   timestamp, followed by encrypted video and audio playback. Do not retain licence
   challenges, licence bodies, provider tokens, or any provider credential.
5. Evidence that the session is temporary and non-persistent, plus failed expired,
   cross-asset, and guessed-grant requests that return neither a licence nor clear
   media.
6. For every capture or external-output path tested, the exact method and the one
   observed result: `Black`, `Blocked`, or `Visible`. Preserve capture artefacts only in
   the access-controlled evidence store and only as long as the release process needs
   them.

For PlayReady, also complete the device and provider evidence in
[issue76-playready-verification.md](issue76-playready-verification.md). The
Widevine/FairPlay provider gate remains in
[issue45-doverunner-drm-verification.md](issue45-doverunner-drm-verification.md).

## Release wording

The current approved wording is:

> No browser/device combination has yet been verified for real encrypted Multi-DRM
> playback on this release. HrizonMedia does not currently claim a capture-blackout
> result or verified PlayReady coverage.

After a row is verified, name its exact browser, device, operating-system version, DRM
system, revision, and capture/output method. Do not generalise a single result into a
claim about a browser family or recording prevention.

Temporary Playback Grants are asset-scoped and allow a new playback start or licence
acquisition for five minutes. The provider policy requests temporary, non-persistent
streaming licences; it does not terminate a session that has already obtained a valid
temporary licence. Offline and persistent licences remain unavailable.

DRM, browser controls, protected output, and the moving visible Leak ID are deterrence
and traceability measures. They cannot guarantee prevention of screen recording,
external-output capture, or camera capture. A visible Leak ID helps investigate a
recording; it does not make that recording impossible.
