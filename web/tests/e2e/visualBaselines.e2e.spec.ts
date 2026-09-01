import path from 'path'
import { fileURLToPath } from 'url'
import { expect, test, type Page } from '@playwright/test'

import { articlePageFixture, cleanupArticlePage, seedArticlePage } from '../helpers/seedArticlePage'
import { cleanupNavigationUser, seedNavigation } from '../helpers/seedNavigation'
import { cleanupVisualIndex, seedVisualIndex, visualIndexFixture } from '../helpers/seedVisualIndex'
import { storeThemePreference } from '../helpers/theme'
import { articleListingPath } from '../../src/utilities/routes'

const HOME = 'http://localhost:3000'

declare global {
  interface Window {
    /** When the document last changed, used to wait for it to go quiet. */
    __lastChange: number
  }
}

const dirname = path.dirname(fileURLToPath(import.meta.url))

/** Injected for the shot only — see the file for what it suppresses and why. */
const screenshotStyle = path.resolve(dirname, '../helpers/screenshot.css')

/**
 * The two surfaces this issue is about.
 *
 * The index is narrowed to the category the fixtures own. See the fixture for
 * why: it is what makes the page hold the same six cards every run, whether
 * this spec runs alone or after everything else in the suite.
 */
const SURFACES = [
  { name: 'an Article', path: () => `/articles/${articlePageFixture.slug}`, slug: 'article' },
  {
    name: 'the Article index',
    path: () => articleListingPath(1, visualIndexFixture.categorySlug),
    slug: 'index',
  },
]

/**
 * Fixed widths, not whatever window the run happens to open in. A baseline is
 * only comparable to itself if the page it photographs is the same width every
 * time, and 1280 and 390 sit either side of the `lg` breakpoint at which the
 * Article page changes shape.
 */
const WIDTHS = [
  { name: 'at a desktop width', slug: 'desktop', viewport: { height: 900, width: 1280 } },
  { name: 'at a phone width', slug: 'mobile', viewport: { height: 844, width: 390 } },
]

const THEMES = ['dark', 'light'] as const

/**
 * Everything that has to have finished before the shutter opens.
 *
 * Web fonts are the timing hazard here: a page photographed on its fallback
 * stack and the same page photographed on Manrope differ in every line of text,
 * which is a diff of the whole document that says nothing about the design. So
 * the shot waits for the font set to settle rather than for a bare load event.
 * Images are the same hazard more visibly, and the scroll reset is because a
 * full-page capture of a page with a sticky header depends on where it starts.
 */
async function settled(page: Page): Promise<void> {
  await page.waitForLoadState('load')

  await page.waitForFunction(async () => {
    await document.fonts.ready

    return (
      document.fonts.status === 'loaded' &&
      Array.from(document.fonts).some((face) => face.status === 'loaded')
    )
  })

  /*
   * Images below the fold are lazy, and a full-page capture does not scroll, so
   * they would photograph blank. Asking for them eagerly is what loads them.
   * Only the ones the reader can see are then waited on: the chrome carries a
   * logo for each theme and hides the one it is not on, and an image that is
   * never displayed is never fetched however it is asked for.
   */
  await page.evaluate(() => {
    for (const image of Array.from(document.images)) image.loading = 'eager'
  })

  await page.waitForFunction(() =>
    Array.from(document.images)
      .filter((image) => image.getClientRects().length > 0)
      .every((image) => image.complete && image.naturalWidth > 0),
  )

  await page.evaluate(() => window.scrollTo(0, 0))

  await hasStoppedChanging(page)
}

/**
 * Waits for the document to go quiet — nothing added, removed or restyled for
 * half a second.
 *
 * This is the wait that matters most, and it was written after a shot caught a
 * page mid-thought. An effect fired about a second after the load event and
 * repainted the chrome, which meant a baseline recorded whichever side of that
 * the shutter happened to fall on. Waiting for the page to be finished, rather
 * than for a particular thing to have happened, does not need to know what the
 * page's client code is going to do.
 */
async function hasStoppedChanging(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__lastChange = performance.now()

    new MutationObserver(() => {
      window.__lastChange = performance.now()
    }).observe(document.documentElement, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    })
  })

  await page.waitForFunction(() => performance.now() - window.__lastChange > 500)
}

/**
 * Takes the shot, once everything that moves has stopped moving.
 *
 * `threshold: 0` is the important argument. Playwright's default of 0.2 is a
 * per-pixel colour tolerance wide enough to swallow the exact regression this
 * seam exists to catch: the ground moved from #08080B to #0D0D14 — a token
 * quietly off the brand across every pixel of the page — and the comparison
 * still passed. A snapshot that cannot see that is not coverage, so the
 * comparison is exact and the tolerance is the one thing here that must never
 * be widened to make a run go green.
 */
async function shot(page: Page, name: string): Promise<void> {
  await settled(page)

  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    fullPage: true,
    stylePath: screenshotStyle,
    threshold: 0,
  })
}

/**
 * Full-page baselines of the two surfaces the redesign is about.
 *
 * This is the seam that catches what no assertion anticipates: a rule that
 * lands on the wrong element, a column that collapses, a scale that goes back
 * to a template default. Its costs are known — a baseline is machine-dependent
 * and a font that has not loaded moves every line on the page — so they are
 * managed here rather than discovered: fixed viewports, seeded content, motion
 * off, and nothing photographed until the fonts have settled.
 *
 * Eight baselines: two surfaces, in both themes, at both widths. If one will
 * not hold still, that is a finding to report, not a threshold to widen — a
 * snapshot loose enough to always pass implies coverage that does not exist.
 */
test.describe('Visual baselines', () => {
  /*
   * The site suppresses its own motion under a reduced-motion preference, so
   * asking for it switches animation off at the source as well as in the
   * capture. `colorScheme` is pinned because the theme has to come from the
   * stored preference alone, not from what the runner's browser reports.
   */
  test.use({ colorScheme: 'light', contextOptions: { reducedMotion: 'reduce' } })

  /*
   * Longer than the 30s default. A baseline is compared by taking the shot
   * repeatedly until two in a row agree, and the page under it is a long one
   * being compiled on demand by the development server.
   */
  test.describe.configure({ timeout: 90_000 })

  test.beforeAll(async () => {
    await seedArticlePage()
    await seedVisualIndex()
    await seedNavigation()
  })

  test.afterAll(async () => {
    await cleanupArticlePage()
    await cleanupVisualIndex()
    await cleanupNavigationUser()
  })

  for (const width of WIDTHS) {
    test.describe(width.name, () => {
      test.use({ viewport: width.viewport })

      for (const surface of SURFACES) {
        for (const theme of THEMES) {
          test(`${surface.name} in the ${theme} theme`, async ({ page }) => {
            await storeThemePreference(page, theme)

            await page.goto(`${HOME}${surface.path()}`)

            await shot(page, `${surface.slug}-${theme}-${width.slug}`)
          })
        }
      }
    })
  }
})
