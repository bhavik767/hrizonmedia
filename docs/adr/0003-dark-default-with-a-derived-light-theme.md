# Dark by default, with a derived light theme

The brand book is a committed dark ground and defines nine tokens, all tuned for Ink
`#08080B`. It names exactly one light-context colour — `Signal Deep #8A6E05`, annotated
"yellow-on-white text, where the bright yellow fails contrast." That is a hint, not a
palette. We chose to ship **both themes, with dark as the default**, and to **derive the
light scale by mirroring the dark scale's hue** rather than inventing a new one.

The forcing question was the article page. These are 2,000-word articles aimed at course
creators arriving cold from search, and dark is a worse long-form reading surface than
every competing result they will have open in another tab. Shipping dark-only would have
meant accepting that cost on the one page type the whole SEO strategy depends on.

## Considered Options

- **Dark only, no switch** — fully faithful to the brand book. Rejected because it forces
  the reading-comfort cost onto the article page with no escape hatch, and because the
  brand book itself already anticipates white surfaces (`Signal Deep`, the black lockup
  variants, the `on-white` specimen). Dark-only would ignore work that was already done.
- **Warm paper for light mode** (`#FAF9F6` ground, warm-grey text) — the best of the three
  to actually read, and it harmonises with Signal Yellow. Rejected because the brand's
  neutrals are uniformly cool and its signal is warm; that cool/warm gap is what makes the
  yellow carry. Warming the paper narrows the gap and quietly produces a second brand that
  happens to share a logo.
- **Clinical white** (`#FFFFFF`, pure neutral greys) — the most literal mirror and the most
  predictable to build against. Rejected because neutral grey beside a violet-cast dark
  theme makes the two modes read as different sites.
- **A per-surface split** — dark chrome, permanently light article body, no switch.
  Rejected in favour of a real toggle, which gets the same reading comfort without
  hard-coding a seam down the middle of the site.

## Consequences

- **The light scale is hue-faithful.** Ink `#08080B` and Mute `#8C8C9A` both carry a faint
  blue-violet cast, and the light tokens carry it too: ground `#FBFBFD`, panel `#FFFFFF`,
  hover `#F4F4F7`, hairline `#E5E5EB`, headings `#08080B`, body `#3C3C46`, captions
  `#6E6E7A`.
- **Elevation inverts between themes.** On dark, panels sit *lighter* than the ground
  (`#101015` on `#08080B`). On light, panels sit *lighter* than the ground too
  (`#FFFFFF` on `#FBFBFD`). This is intentional and is the correct light-mode convention;
  it is not a mistake to be "fixed".
- **Signal Yellow `#F3C30C` is fill-only in both themes.** Links and any yellow text use
  `Signal Deep #8A6E05`. Text on a yellow fill is always `#08080B`, never white.
- **The OS preference is deliberately ignored.** The template's `InitTheme` script reads
  `defaultTheme` last, after `prefers-color-scheme`, so flipping the default alone changes
  nothing in practice — a visitor on a light-mode laptop still gets light. Making dark
  genuinely default requires dropping that fallback, so resolution becomes: stored
  preference, else dark. This overrides a signal the visitor's OS is stating on their
  behalf. Accepted as a brand decision; revisit if it draws complaints.
- **Every new component costs twice.** There is no "just style it dark" any more. Both
  themes are real surfaces and both need checking.
- The brand book itself remains dark-only and is not the light theme's source of truth.
  If the light scale changes, this ADR is where it changes.
