## Problem Statement

A course creator with a piracy problem searches for something like "stop students downloading my course videos" and lands on an EncryptStream Article. What they find is an unmodified Payload website template: default typography, default greys, a stock homepage layout, and URLs that announce the CMS that produced them.

Three separate costs follow from that.

**Nothing signals that EncryptStream is a serious secure video platform.** The Article is about protecting video from theft, and it is delivered on a surface indistinguishable from any other template site. A reader deciding whether these people can be trusted with their catalogue has nothing to go on. The brand book exists and is thorough, and none of it has reached the site.

**The Article is hard to use as a document.** These run long. There is no way to see the shape of one before committing to it, no way to jump to the section that matches the reader's actual question, and no way to leave with the argument if they only skim. A reader who wanted one answer has to read two thousand words to find it, or leave.

**Every reader earned is a reader lost.** There is no way for someone who found the Article useful to hear from EncryptStream again. The blog-led strategy that ADR-0001 and ADR-0002 were both decided around depends on the domain accruing authority over months; during that window the site converts nobody and remembers nobody, so the audience built by early Articles is gone by the time there is a product to tell them about.

## Solution

Rebuild the Article reading experience on the brand book, structured to match how a reader actually uses a long reference piece, with exactly one thing to do at the end of it.

**The brand becomes visible.** The site adopts the brand book's palette, typefaces, radius scale and glow discipline. Per ADR-0003 the ground is dark by default with a light theme available on a toggle, and both are real, maintained surfaces rather than one being an afterthought.

**The Article becomes navigable.** A sticky table of contents tracks progress and offers direct passage to any section. A Key takeaways box near the top gives a skimmer the argument without the supporting detail. An FAQ section answers the adjacent questions a reader arrives with. Figures carry source captions so claims are checkable.

**There is one ask, and it is honest.** A single email capture, appearing in the sticky sidebar and again at the end of the Article, offering early access to EncryptStream when it opens. Nothing else on the page competes with it: no promotional bar, no header button, no mid-Article interruption. Per the brand book, one primary per view.

**Articles live at addresses that describe them.** URLs move from the template's CMS vocabulary to `/articles/<slug>`, matching the canonical term in the glossary. This happens now, while nothing is indexed and the change is free.

## User Stories

### Reading an Article

1. As a course creator arriving from search, I want the Article to look like it was made by a company that takes video security seriously, so that I can judge whether to trust them with my catalogue.
2. As a course creator, I want to read two thousand words without eye strain, so that I finish the Article instead of abandoning it halfway.
3. As a course creator who prefers a light background, I want to switch the site to a light theme, so that I can read comfortably in a bright room.
4. As a course creator who chose a theme, I want that choice remembered when I return, so that I do not have to set it on every visit.
5. As a course creator, I want the Article's headings to be visibly distinct from its body text, so that I can perceive the structure while scrolling.
6. As a course creator, I want body text set to a comfortable measure rather than the full width of my monitor, so that my eye can find the start of each line.
7. As a course creator on a phone, I want the Article to be as readable as it is on a desktop, so that I can read it on the commute where I actually have time.
8. As a course creator, I want links inside the Article to be obviously clickable without shouting, so that I can follow a reference without losing my place.
9. As a course creator, I want code and technical terms to be visually distinct from prose, so that I can tell an instruction from an explanation.

### Navigating an Article

10. As a course creator, I want a table of contents visible alongside the Article, so that I can see its full shape before deciding to invest time in it.
11. As a course creator, I want the table of contents to follow me as I scroll, so that I can jump elsewhere at any point without scrolling back to the top.
12. As a course creator, I want the table of contents to show which section I am currently reading, so that I always know where I am in a long piece.
13. As a course creator with one specific question, I want to click straight to the relevant section, so that I do not have to read the parts that do not apply to me.
14. As a course creator on a phone, I want the table of contents to be reachable but not to consume the screen, so that it helps rather than obstructs.
15. As a course creator who is skimming, I want a Key takeaways box near the top, so that I leave with the argument even if I read nothing else.
16. As a course creator, I want each Key takeaway to stand on its own without the surrounding paragraph, so that it is useful out of context.
17. As a course creator, I want an FAQ section covering the adjacent questions, so that the follow-up I was about to search for is already answered here.
18. As a course creator, I want to see which category an Article belongs to, so that I can tell whether it is about the problem, the comparison, or my specific platform.
19. As a course creator who finished an Article, I want related Articles suggested, so that I can keep reading without returning to a search engine.
20. As a course creator, I want to know when the Article was published, so that I can judge whether its claims about platforms and tooling are still current.

### Evaluating claims

21. As a course creator, I want figures and charts to carry a source caption, so that I can verify a claim rather than take it on faith.
22. As a course creator, I want images to be legible in whichever theme I am using, so that a screenshot is not washed out or blown out.
23. As a course creator, I want to know who wrote the Article, so that I can weigh the expertise behind it.
24. As a course creator, I want the author biography to tell me about the company behind EncryptStream, so that I understand who I would be buying from.

### Hearing from EncryptStream again

25. As a course creator convinced by an Article, I want a clear way to hear from EncryptStream, so that I do not have to remember the name and come back later.
26. As a course creator, I want the offer to state exactly what I will receive, so that I can decide without guessing what I am agreeing to.
27. As a course creator, I want to be told that EncryptStream is not open yet, so that I am not misled into expecting a product I can use today.
28. As a course creator, I want to know roughly how often I will be contacted, so that I can judge whether it is worth my address.
29. As a course creator reading on a desktop, I want the sign-up available in the sidebar while I read, so that I can act at the moment I am convinced.
30. As a course creator who read to the end, I want the sign-up repeated there, so that I do not have to scroll back to find it.
31. As a course creator who submits my address, I want immediate confirmation that it worked, so that I do not submit twice or wonder whether it failed.
32. As a course creator who mistypes my address, I want to be told before submitting, so that I do not silently fail to sign up.
33. As a course creator, I want the page to be free of competing offers, so that the one thing being asked of me is obvious.
34. As a course creator suspicious of marketing sites, I want no promotional bar or pop-up interrupting me, so that I trust the content is the point.

### Finding Articles

35. As a course creator, I want an index of all Articles, so that I can browse what exists rather than searching blindly.
36. As a course creator, I want to filter the index by category, so that I can find everything about my particular problem.
37. As a course creator, I want each index entry to show enough to judge relevance, so that I do not open Articles that do not apply to me.
38. As a course creator, I want search available from anywhere on the site, so that I can look for a specific term without browsing.
39. As a course creator, I want the site navigation to show the categories that exist, so that I can discover topics I did not know to search for.
40. As a course creator, I want URLs that describe the content, so that a link I paste to a colleague is self-explanatory.

### Authoring

41. As the Author, I want to add a Key takeaways box anywhere in an Article, so that I can place it where it reads best rather than where a template forces it.
42. As the Author, I want to add an FAQ section anywhere in an Article, so that I can answer questions in context rather than only in a lump at the end.
43. As the Author, I want to add more than one FAQ section to a single Article, so that I can address different question clusters in different places.
44. As the Author, I want the new blocks available in the same editor toolbar as existing blocks, so that I do not have to learn a separate mechanism.
45. As the Author, I want the table of contents generated from my headings automatically, so that I do not maintain it by hand and let it drift.
46. As the Author, I want my byline applied without setting it per Article, so that I do not repeat myself ten times.
47. As the Author, I want to preview an Article in both themes before publishing, so that I do not ship something broken in the theme I do not personally use.
48. As the Author, I want to read collected email addresses in the admin panel, so that I can contact people at launch without a third-party service.
49. As the Author, I want the seeded launch Articles to render correctly in the new design, so that I am not rewriting ten Articles to fit a template.

### Trust and accessibility

50. As a course creator using a screen reader, I want the Article's heading hierarchy to be correct, so that I can navigate by heading.
51. As a course creator navigating by keyboard, I want visible focus indicators throughout, so that I always know what is selected.
52. As a course creator with low vision, I want text to meet contrast requirements in both themes, so that I can read without straining.
53. As a course creator with reduced-motion settings, I want animations suppressed, so that the site does not cause discomfort.
54. As a course creator on a slow connection, I want the Article's text to appear before its images, so that I can start reading immediately.

## Implementation Decisions

### Design tokens and theming

Both themes are defined as CSS custom properties in the frontend stylesheet, replacing the template's stock neutral scale. The dark values come from the brand book; the light values are derived per ADR-0003 and that ADR is their source of truth, not the brand book.

| Role | Dark | Light |
| --- | --- | --- |
| Ground | `#08080B` | `#FBFBFD` |
| Panel | `#101015` | `#FFFFFF` |
| Hover | `#191920` | `#F4F4F7` |
| Hairline | `#26262F` | `#E5E5EB` |
| Headings | `#FFFFFF` | `#08080B` |
| Body | `#8C8C9A` | `#3C3C46` |
| Captions | `#5C5C68` | `#6E6E7A` |
| Links | `#F3C30C` | `#8A6E05` |

Signal Yellow `#F3C30C` is a fill-only colour in both themes. Text on a yellow fill is always `#08080B`, never white. Elevation inverts between themes — panels sit lighter than the ground in both — and this is deliberate, not a defect.

**Theme resolution order changes.** The template's initialisation script currently resolves in the order: stored preference, then the operating system's `prefers-color-scheme`, then the configured default. Because the OS signal is almost always present, the configured default is effectively dead code and a visitor on a light-mode machine receives the light theme regardless of configuration. The OS branch is removed so resolution becomes: stored preference, else dark. This deliberately overrides a preference the visitor's OS is stating on their behalf; ADR-0003 records that trade-off.

Theme resolution must remain inline and blocking before first paint. A flash of the wrong theme is a defect.

### Typography

Typefaces move from the template's defaults to the brand book's three: Manrope for display and headings, IBM Plex Sans for body and interface, IBM Plex Mono for data, code and labels. Loaded through the framework's font optimisation with explicit fallback stacks, not a render-blocking external stylesheet.

The brand book's scale is adopted as specified: H1 at 48px / weight 800 / -3% tracking, H2 at 32 / 800 / -2%, H3 at 20 / 700 / -1%, body at 16 / 400 / 1.65 line height, mono at 14 / 400 / +2%, labels at 11 / 400 / +18%. Display sizes are fluid at smaller viewports; body size is not. Body text is set to approximately 65 characters, per the brand book.

### Surfaces

Radius takes exactly three values and no others: 999px for buttons and pills, 16px for cards and inputs, 20px for plates and hero surfaces. Depth comes from value and 1px hairlines, never from shadows. Exactly one radial glow may appear per viewport; on the Article page it is behind the hero and nowhere else.

### Routing

Articles move from the template's `posts` path to `/articles/<slug>`, matching the canonical term. The Payload collection slug remains `posts` internally — renaming it would require a database migration for no user-visible gain, and the glossary records that "post" is a code-only word that never appears in the interface, in copy, or in a URL.

The listing and its pagination move correspondingly. Sitemap generation, the search index and the redirects plugin all reference the new paths. Because nothing is published or indexed, redirects from the old paths are not required; if any are added they are a convenience, not a correctness requirement.

### Content model

Two blocks are added to the rich text editor's block list, alongside the existing banner, code and media blocks. Neither becomes a top-level field; both are insertable anywhere in the flow, any number of times.

A **Key takeaways** block holds an ordered list of short statements plus an optional heading. Each entry is a single claim written to stand alone without its surrounding paragraph.

An **FAQ** block holds an ordered list of question and answer pairs plus an optional heading. Questions are plain text; answers are rich text so they can carry links and emphasis. Each question renders with a stable anchor. Answers are visible by default rather than collapsed — hidden text is weaker for answer extraction and forces an interaction to read.

No change is made to figure captions; the media collection already carries a caption field and it is used for source lines.

### Table of contents

Derived at render time from the Article's second and third level headings. Not authored, not stored, and not a field. Each heading receives a stable slug-derived anchor; collisions are disambiguated with a numeric suffix. The active section is tracked by intersection observation against heading positions.

On desktop the table of contents occupies a sticky right rail. On viewports too narrow for two columns it collapses to a disclosure directly beneath the Article hero, closed by default. It is a navigation landmark and its entries are ordinary links, so it works without JavaScript and degrades to a plain list.

### Email capture

Built on the form builder plugin already installed. A single form is defined with one email field. The capture component is purpose-built to the brand rather than rendered through the generic form block, because it appears in fixed positions and carries fixed copy.

The copy is fixed: heading "Be first when EncryptStream opens", supporting line "We'll email you once, when it's ready", button label "Get early access". Per the brand book a button names its outcome, so "Subscribe", "Sign up" and "Submit" are all excluded.

It appears in exactly two places: the sticky sidebar beneath the table of contents, and at the end of the Article body. Both instances submit to the same form. Nothing else on the page is a primary action.

Validation happens client-side before submission, and success, failure and in-flight states are all rendered. Submissions persist to the plugin's submissions collection and are readable in the admin panel.

**There is no email transport configured in the project.** Nothing is sent on submission and nothing is promised to be. The offer was chosen partly because it owes the reader nothing until launch day. Wiring a transport is out of scope.

### Chrome

The header carries the logo lockup, links to the three categories, a search affordance and the theme toggle. It carries no call to action and no promotional bar. Both are deliberate: the sidebar capture is the single primary on the page, and a header button would compete with it.

The footer carries the logo mark, the same category links, a second email capture and legal links. The theme toggle appears once, in the header.

Header and footer navigation remain driven by the existing globals, so link sets stay editable without a deploy.

### Article page composition

Top to bottom: hero with category, title, byline and publication date over the page's single glow; then a two-column region with the Article body in the primary column and the sticky rail in the secondary; then the author biography; then the related Articles grid.

The author biography is fixed site configuration, not a per-Article relationship. The template's multi-author machinery remains in the schema but is not surfaced.

The index page presents Articles as cards in a responsive grid with category filters, using the same tokens and card treatment as the related Articles grid.

## Testing Decisions

### What makes a good test here

Tests assert what a reader experiences: what is on the page, what happens when they act, and what the page looks like. They do not assert component structure, class names, or how state is held. A test that fails when the design is refactored but the reader's experience is unchanged is a bad test.

Design work has a specific failure mode — a token silently regresses to a template default and nothing behaves incorrectly. So brand adherence is asserted directly, through computed styles, rather than trusted.

### Seam 1 — Playwright against rendered pages (existing seam, highest available)

The primary seam. Prior art is the existing frontend end-to-end suite, which drives a real browser against a running server and asserts on rendered output. Fixtures follow the existing seed helper pattern: created through the Payload Local API in `beforeAll`, removed in `afterAll`, with revalidation disabled in the hook context because revalidation is unavailable outside a request.

Behaviour under test:

- A visitor with no stored preference receives the dark theme, including when the browser reports a light OS preference.
- Toggling the theme changes it and the choice survives a reload.
- No flash of the wrong theme occurs before first paint.
- An Article renders at its `/articles/<slug>` address.
- The index renders and its category filters narrow the set.
- Key takeaways and FAQ blocks render when present and are absent when not.
- Multiple FAQ blocks in one Article all render.
- Table of contents entries reflect the Article's headings and navigate to them.
- The table of contents collapses to a disclosure at narrow viewports.
- Submitting the email capture creates a submission; an invalid address is rejected before submission; success is confirmed to the reader.
- The header contains no call to action and no promotional bar.
- Heading hierarchy is well-formed and focus is visible when navigating by keyboard.

Brand adherence under test, via computed styles rather than pixels: ground colour resolves to `rgb(8, 8, 11)` in dark and `rgb(251, 251, 253)` in light; headings resolve to a Manrope stack; link colour resolves to `rgb(138, 110, 5)` in the light theme; text on a yellow fill resolves to `rgb(8, 8, 11)`.

### Seam 2 — Visual regression via Playwright screenshots (new, within the existing harness)

Full-page snapshots of one Article and the index, in both themes, at a desktop and a mobile viewport. This is the highest seam available for a redesign and the only one that catches layout breakage no assertion anticipates.

Its known costs are accepted and must be managed rather than discovered: baselines are machine-dependent, and web font loading is a timing hazard. Snapshots are therefore taken only after fonts have settled, with animations disabled and a fixed viewport, against seeded fixture content rather than live Articles so the input is stable. Baselines are committed. Expect churn while the design is still moving; that is the trade being made in exchange for catching regressions the behavioural assertions cannot see.

### Seam 3 — Payload Local API via vitest (existing seam)

Narrow, for the schema change only. Prior art is the existing integration spec, which boots Payload directly and exercises collections. Under test: the collection accepts content containing the two new blocks and returns it intact; a submission created through the form builder persists and is retrievable.

### Pre-existing test that must be updated

The current frontend suite asserts that the homepage title matches the template's name and that its first heading reads the same. Chrome and branding changes will fail it. Updating it is part of this work and is not a regression.

## Out of Scope

- **The homepage.** It remains the stock template layout. Only the chrome around it changes.
- **Email sending.** No transport is configured and none is added. Addresses are collected and read in the admin panel.
- **The product, and any backend behind it.** No sign-up, no dashboard, no licensing. The offer deliberately promises nothing before launch.
- **Writing Article content.** The ten seeded Articles are working drafts and stay that way. This work makes them render well; it does not finish them.
- **Renaming the Payload collection.** It stays `posts` internally. A migration for a name nobody sees is not worth it.
- **Redirects from the old paths.** Nothing is published or indexed, so nothing needs preserving.
- **The duplicated test directory.** A stray mirror of the test tree exists with differing contents, outside the configured test directory. It should be removed, but not as part of this work.
- **Production database selection.** Still open per the setup notes, and unaffected by this.
- **The unresolved backend boundary.** ADR-0002 claims two backends exist and no second backend is present in this repository. That contradiction is untouched here and still needs its own ADR.

## Further Notes

**On the theme default.** Overriding `prefers-color-scheme` is a deliberate brand decision and some readers will consider it rude. It is reversible in one place. If it draws complaints, the fix is to restore the OS branch, not to redesign anything.

**On the light theme's authority.** The brand book is dark-only and is not the source of truth for the light scale. ADR-0003 is. Changes to light values belong there.

**On the one-primary rule.** Several decisions in this document — no header button, no promotional bar, no mid-Article interruption — are consequences of a single brand book rule: one primary action per view, and if a screen appears to need two yellow buttons then one of them is not primary. Anyone tempted to add an ask should read that rule first.

**On register.** Per the glossary, Articles open in searcher language and close in canonical language. Interface copy is canonical language throughout, with no exemption: the interface is never the place where a reader is still being met in their own words.

**On sequencing.** The dependency order is tokens and typefaces first, then chrome, then the Article page, then the two blocks, then the email capture, then the route move, then the index. The route move is placed late deliberately — it is cheap now and expensive after anything is indexed, but it invalidates test paths, so it is better done once the pages it points at are settled.
