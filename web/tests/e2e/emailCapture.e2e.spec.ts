import { expect, test, type Locator, type Page } from '@playwright/test'

import { collected, collectedAddresses, forgetAddresses } from '../helpers/earlyAccess'
import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'
import { articlePageFixture, cleanupArticlePage, seedArticlePage } from '../helpers/seedArticlePage'
import { storeThemePreference } from '../helpers/theme'

const HOME = 'http://localhost:3000'
const ARTICLE = `${HOME}/articles/${articlePageFixture.slug}`

/** Every address this spec signs up, so it can take them back out again. */
const signedUp: string[] = []

function address(what: string): string {
  const value = `e2e-${what}-${Date.now()}@example.com`
  signedUp.push(value)
  return value
}

/** The capture in the sticky rail, beneath the table of contents. */
function sidebarCapture(page: Page): Locator {
  return page.getByRole('complementary').getByRole('region', { name: COPY.heading })
}

/**
 * The capture that closes the Article body. It is located at a width too narrow
 * for the rail, where it is the only one the Article carries — the alternative
 * is picking a sibling out of the grid by position, which says nothing about
 * what a reader sees.
 */
function closingCapture(page: Page): Locator {
  return page.locator('article').getByRole('region', { name: COPY.heading })
}

function footerCapture(page: Page): Locator {
  return page.getByRole('contentinfo').getByRole('region', { name: COPY.heading })
}

async function signUp(capture: Locator, value: string): Promise<void> {
  await capture.getByLabel('Email address').fill(value)
  await capture.getByRole('button', { name: COPY.button }).click()
}

/**
 * The copy, written out here rather than imported from the source it renders
 * from. These three lines are fixed by the brief: the heading, the line that
 * admits the product is not open yet, and a button that names its outcome. A
 * test that imported them would agree with any rewording, which is the one
 * thing it exists to catch.
 */
const COPY = {
  heading: 'Be first when EncryptStream opens',
  supporting: "We'll email you once, when it's ready",
  button: 'Get early access',
} as const

/** What the one form is called where the Author reads its submissions. */
const earlyAccessFormTitle = 'Early access'

test.describe('The one thing the site asks', () => {
  test.beforeAll(async () => {
    await seedArticlePage()
  })

  test.afterAll(async () => {
    await cleanupArticlePage()
    await forgetAddresses(signedUp)
  })

  test('the Article asks twice: beside the reader as they read, and again at the end', async ({
    page,
  }) => {
    await page.goto(ARTICLE)

    await expect(page.locator('article').getByRole('region', { name: COPY.heading })).toHaveCount(2)
  })

  test('wherever a reader signs up, they land on the same list', async ({ page }) => {
    const fromRail = address('rail')
    const fromFooter = address('footer')
    const fromClosing = address('closing')

    await page.goto(ARTICLE)

    await signUp(sidebarCapture(page), fromRail)
    await expect(sidebarCapture(page).getByRole('status')).toContainText("You're on the list")

    await signUp(footerCapture(page), fromFooter)
    await expect(footerCapture(page).getByRole('status')).toContainText("You're on the list")

    // Narrow enough that the rail is gone and the closing capture stands alone.
    await page.setViewportSize({ width: 375, height: 667 })
    await page.reload()

    await expect(closingCapture(page)).toHaveCount(1)
    await signUp(closingCapture(page), fromClosing)
    await expect(closingCapture(page).getByRole('status')).toContainText("You're on the list")

    const mine = (await collected()).filter((entry) =>
      [fromClosing, fromFooter, fromRail].includes(entry.address),
    )

    expect(mine.map((entry) => entry.address).sort()).toEqual(
      [fromClosing, fromFooter, fromRail].sort(),
    )
    expect(new Set(mine.map((entry) => entry.form)).size).toBe(1)
  })

  test('a mistyped address is caught here, and never leaves the browser', async ({ page }) => {
    await page.goto(ARTICLE)

    let attempts = 0
    await page.route('**/api/form-submissions', async (route) => {
      attempts += 1
      await route.abort()
    })

    const capture = sidebarCapture(page)
    const field = capture.getByLabel('Email address')

    await field.fill('course-creator.example.com')
    await capture.getByRole('button', { name: COPY.button }).click()

    await expect(capture.getByRole('status')).toContainText('Enter an email address')
    await expect(field).toHaveAttribute('aria-invalid', 'true')

    // The point of catching it here: nothing was sent that could not succeed.
    expect(attempts).toBe(0)

    // Correcting it clears the complaint rather than leaving it accusing.
    await field.fill('course-creator@example.com')
    await expect(capture.getByRole('status')).toHaveCount(0)
    await expect(field).toHaveAttribute('aria-invalid', 'false')
  })

  test('a reader is told it is in flight, and told plainly when it fails', async ({ page }) => {
    await page.goto(ARTICLE)

    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    await page.route('**/api/form-submissions', async (route) => {
      await held
      await route.fulfill({ status: 500, body: '{}', contentType: 'application/json' })
    })

    const capture = sidebarCapture(page)
    const button = capture.getByRole('button', { name: COPY.button })

    await signUp(capture, 'course-creator@example.com')

    // In flight: said out loud, and the button cannot be pressed a second time.
    await expect(capture.getByRole('status')).toContainText('Sending your address')
    await expect(button).toBeDisabled()

    release()

    // Failed: a different thing to read, and the form is still there to retry.
    await expect(capture.getByRole('status')).toContainText("That didn't send")
    await expect(button).toBeEnabled()
    await expect(capture.getByLabel('Email address')).toBeVisible()
  })

  test('the ask sits on a panel and a hairline in either theme', async ({ page }) => {
    await page.goto(ARTICLE)

    const capture = sidebarCapture(page)

    await expect(capture).toHaveCSS('background-color', 'rgb(16, 16, 21)')
    await expect(capture).toHaveCSS('border-top-color', 'rgb(38, 38, 47)')
    await expect(capture).toHaveCSS('box-shadow', 'none')

    await storeThemePreference(page, 'light')
    await page.reload()

    await expect(capture).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(capture).toHaveCSS('border-top-color', 'rgb(229, 229, 235)')

    // The fill does not change between themes, and neither does the text on it.
    await expect(capture.getByRole('button', { name: COPY.button })).toHaveCSS(
      'background-color',
      'rgb(243, 195, 12)',
    )
    await expect(capture.getByRole('button', { name: COPY.button })).toHaveCSS(
      'color',
      'rgb(8, 8, 11)',
    )
  })

  test('a keyboard reader can reach the field and the button, and see which they are on', async ({
    page,
  }) => {
    await page.goto(ARTICLE)

    const capture = sidebarCapture(page)

    for (const control of [capture.getByLabel('Email address'), capture.getByRole('button')]) {
      await control.focus()

      await expect(control).toBeFocused()

      const ring = await control.evaluate((element) => {
        const style = getComputedStyle(element)
        return (
          (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
          style.boxShadow !== 'none'
        )
      })

      expect(ring).toBe(true)
    }
  })

  /*
   * The whole point of collecting an address before there is a product: the
   * Author has to be able to reach the people who left one, without a
   * third-party service. Nothing is sent from this site, so the admin panel is
   * the only place those addresses are ever read.
   */
  test('the Author can read a collected address in the admin panel', async ({ browser }) => {
    /*
     * This test signs up on the front end and then logs into the admin panel,
     * so it pays for a cold compile of both. Headroom for that, not cover for a
     * slow assertion: a wrong one still fails, just later.
     */
    test.setTimeout(180_000)

    const value = address('admin')

    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      await page.goto(ARTICLE)
      await signUp(sidebarCapture(page), value)
      await expect(sidebarCapture(page).getByRole('status')).toContainText("You're on the list")

      const submission = (await collected()).find((entry) => entry.address === value)
      expect(submission, 'the sign-up should have been recorded').toBeDefined()

      await seedTestUser()
      await login({ page, user: testUser })

      await page.goto(`${HOME}/admin/collections/form-submissions/${submission!.id}`)

      await expect(page.getByText(value)).toBeVisible()
      await expect(page.getByText(earlyAccessFormTitle)).toBeVisible()
    } finally {
      await cleanupTestUser()
      await context.close()
    }
  })

  test('the button is a yellow pill with dark text, and nothing else on the page is', async ({
    page,
  }) => {
    await page.goto(ARTICLE)

    const button = sidebarCapture(page).getByRole('button', { name: COPY.button })

    await expect(button).toHaveCSS('background-color', 'rgb(243, 195, 12)')
    // Text on the yellow fill is the ground colour, never white.
    await expect(button).toHaveCSS('color', 'rgb(8, 8, 11)')
    await expect(button).toHaveCSS('border-top-left-radius', '999px')

    /*
     * One primary per view. Signal Yellow is the fill of the single ask, so
     * every yellow fill on the Article has to be that same ask — anything else
     * wearing it is a second primary competing with the one that matters.
     */
    const wearingYellow = await page.evaluate(() =>
      Array.from(document.querySelectorAll('body *'))
        .filter((element) => getComputedStyle(element).backgroundColor === 'rgb(243, 195, 12)')
        .map((element) => element.textContent?.trim() ?? ''),
    )

    expect(new Set(wearingYellow)).toEqual(new Set(['Get early access']))
  })

  test('a reader who signs up is told it worked, and the address is kept', async ({ page }) => {
    const value = address('sidebar')

    await page.goto(ARTICLE)

    const capture = sidebarCapture(page)
    await signUp(capture, value)

    await expect(capture.getByRole('status')).toContainText("You're on the list")

    // A reader who is already on the list is not invited to sign up again.
    await expect(capture.getByRole('button', { name: COPY.button })).toHaveCount(0)

    // And the Author can read the address in the admin panel afterwards.
    expect(await collectedAddresses()).toContain(value)
  })

  test('the sidebar asks the reader for their address, in the words it was given', async ({
    page,
  }) => {
    await page.goto(ARTICLE)

    const capture = page.getByRole('complementary').getByRole('region', { name: COPY.heading })

    await expect(capture.getByRole('heading', { name: COPY.heading })).toBeVisible()
    await expect(capture).toContainText(COPY.supporting)
    await expect(capture.getByRole('button', { name: COPY.button })).toBeVisible()

    // Beneath the contents, not above it: the rail is for finding your way
    // through the Article first, and acting on it second.
    const contents = await page
      .getByRole('navigation', { name: 'On this page' })
      .boundingBox()
    const ask = await capture.boundingBox()

    expect(ask!.y).toBeGreaterThan(contents!.y + contents!.height)
  })
})
