# hrizonmedia

A secure video platform: customers upload video, we encrypt, store and deliver it,
and issue DRM licences so it plays on approved devices and nowhere else.

## Language

### Pilot product

**Pilot Workspace**:
The shared pilot tenancy boundary in which invited members evaluate the secure video platform.

**Pilot Member**:
An invited, active or disabled identity within the Pilot Workspace, with uploader or operator privileges.
_Avoid_: user, CMS administrator

**Operator**:
A Pilot Member authorized to invite and disable members and manage every Media Asset.

**Media Asset**:
An uploader-owned video and its lifecycle record, from uploading through processing, readiness, failure, expiry or deletion.
_Avoid_: file, video upload (when referring to the whole asset)

**Upload Session**:
A resumable multipart transfer of one Media Asset's raw source, valid for 24 hours.

**Processing Job**:
An asynchronous attempt to prepare a Media Asset for adaptive encrypted playback.

**Rendition**:
A resolution-specific encoded version of a Media Asset for adaptive playback.

**DRM Content ID**:
The identifier binding encrypted media to its playback licences, distinct from the Media Asset identity.

**Playback Grant**:
An owner-authorized, asset-scoped permission to start playback within five minutes; it does not limit watch time.

**Audit Event**:
A record of a lifecycle, security or operator action in the Pilot Workspace.

### Registers

Two vocabularies are in deliberate use. Confusing them is the most likely way this
glossary gets misapplied.

**Canonical language**:
The terms defined below. Used in article bodies, code, ADRs, issue titles and the
product UI. Precision is the point.

**Searcher language**:
The words a course creator uses before they know the domain — "DRM provider",
"download protection", "video piracy". Permitted only in article titles, meta descriptions
and ad copy, where matching the query is the point. An article opens in searcher
language and moves the reader to canonical language; the `_Avoid_` lists below are
therefore the misconceptions the articles exist to correct, not words that are banned
from the site.

### Domain terms

**Secure video platform**:
What hrizonmedia is as a whole — upload, transcoding, encrypted storage, delivery,
DRM licensing and playback, sold as one product.
_Avoid_: DRM service, DRM provider, video CDN

**Video DRM**:
The specific capability of issuing playback licences to a client device so that
decryption keys never rest in the clear. One capability of the platform, not the
platform itself.
_Avoid_: using "DRM" as a synonym for the whole product

**Multi-DRM**:
Support for all three licence ecosystems — Widevine, FairPlay and PlayReady — so
that a title plays across Android, Apple and Windows devices.

**Encryption**:
Rendering the stored and delivered video unreadable without a key. Necessary for
DRM but not sufficient — AES-128/HLSe encryption alone is not DRM, because the key
is not protected by a licence exchange.
_Avoid_: treating encryption and DRM as interchangeable

**Customer**:
The business or individual that buys hrizonmedia and uploads video. The primary
segment is course creators and edtech platforms; OTT services and enterprises are
secondary.
_Avoid_: user, client, account

**Course creator**:
The primary customer segment — someone selling recorded teaching, from a solo
instructor to a test-prep institute. Their problem is stated as piracy and resale,
not as encryption or DRM.
_Avoid_: educator, teacher, instructor (too narrow — many are businesses)

**Viewer**:
The person who watches a customer's video. Never buys from hrizonmedia directly.
_Avoid_: user, end user, subscriber, student, learner — including in article titles.
"Student" is the one searcher term not granted a title exemption: it narrows the
audience to classrooms when many customers sell to businesses and parents.

**Article**:
A published piece of writing on the hrizonmedia site. Opens in searcher language
and moves the reader to canonical language — the register shift described above is
the article's job, not an accident of it.
_Avoid_: post, blog post, content piece. "Post" is the Payload template's word,
not ours; it survives only as an internal collection name and never appears in the
UI, in copy, or in a URL.

**Key takeaway**:
A single claim from an Article, stated so it stands alone without the surrounding
paragraph. Grouped into a box near the top so a reader who never scrolls still
leaves with the argument.
_Avoid_: summary, TL;DR, highlights

**Author**:
The one person who writes and publishes every Article. Singular by design — the
byline is a fixed property of the site, not a per-Article choice.
_Avoid_: contributor, writer, editor (all imply a plurality that does not exist)
