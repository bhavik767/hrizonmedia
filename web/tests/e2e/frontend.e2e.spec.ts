import { expect, test } from '@playwright/test'

const demoDisabled = process.env.HRIZONMEDIA_DEMO_ENABLED === 'false'

function luminance(rgb: string) {
  const channels = rgb.match(/\d+/g)?.slice(0, 3).map(Number) ?? []
  return channels.reduce((sum, channel, index) => {
    const linear = channel / 255 <= 0.04045
      ? channel / 255 / 12.92
      : ((channel / 255 + 0.055) / 1.055) ** 2.4
    return sum + linear * [0.2126, 0.7152, 0.0722][index]
  }, 0)
}

function contrastRatio(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

test.describe('HrizonMedia landing page', () => {
  test('presents the approved secure-video identity and one Demo action', async ({ page }) => {
    test.skip(demoDisabled, 'This case exercises the enabled Demo flag')
    await page.goto('/')

    await expect(page).toHaveTitle('HrizonMedia | Secure video. Precisely controlled.')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Plays where you allow it.Nowhere else.',
    )
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'HrizonMedia home' }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open the HrizonMedia Demo' })).toHaveCount(1)

    const visibleCopy = await page.locator('body').innerText()
    expect(visibleCopy).not.toMatch(/Payload|eSaral|EncryptStream/)
  })

  test('uses the approved dark palette and typography', async ({ page }) => {
    test.skip(demoDisabled, 'This case exercises the enabled Demo flag')
    await page.goto('/')

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(8, 8, 11)')
    await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-family', /manrope/i)

    const demo = page.getByRole('link', { name: 'Open the HrizonMedia Demo' })
    await expect(demo).toHaveCSS('background-color', 'rgb(243, 195, 12)')
    await expect(demo).toHaveCSS('color', 'rgb(8, 8, 11)')

    const colors = await page.evaluate(() => {
      const body = getComputedStyle(document.body)
      const action = getComputedStyle(
        document.querySelector('[aria-label="Open the HrizonMedia Demo"]') as HTMLElement,
      )
      return {
        actionBackground: action.backgroundColor,
        actionText: action.color,
        bodyBackground: body.backgroundColor,
        bodyText: body.color,
      }
    })
    expect(contrastRatio(colors.bodyText, colors.bodyBackground)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.actionText, colors.actionBackground)).toBeGreaterThanOrEqual(4.5)
  })

  test('provides complete brand metadata and icon variants', async ({ page, request }) => {
    await page.goto('/')

    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /secure video platform/i,
    )
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      /HrizonMedia/,
    )
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /opengraph-image/)
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
      'content',
      /twitter-image/,
    )
    await expect(page.locator('link[rel="icon"]')).toHaveCount(2)
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1)
    await expect.poll(async () => (await request.get('/favicon.ico')).status()).toBe(200)
    await expect.poll(async () => (await request.get('/apple-touch-icon.png')).status()).toBe(200)
  })

  test('remains usable on a narrow screen and exposes keyboard focus', async ({ page }) => {
    test.skip(demoDisabled, 'This case exercises the enabled Demo flag')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(horizontalOverflow).toBeLessThanOrEqual(1)
    await expect(page.getByRole('link', { name: 'Open the HrizonMedia Demo' })).toBeVisible()

    await page.keyboard.press('Tab')
    const skipLink = page.getByRole('link', { name: 'Skip to content' })
    await expect(skipLink).toBeFocused()
    await expect(skipLink).toBeVisible()

    await page.keyboard.press('Tab')
    const focusedLink = page.getByRole('banner').getByRole('link', { name: 'HrizonMedia home' })
    await expect(focusedLink).toBeFocused()
    const outlineWidth = await focusedLink.evaluate((element) => getComputedStyle(element).outlineWidth)
    expect(Number.parseFloat(outlineWidth)).toBeGreaterThan(0)

    await page.keyboard.press('Tab')
    const demo = page.getByRole('link', { name: 'Open the HrizonMedia Demo' })
    await expect(demo).toBeFocused()
    expect(
      Number.parseFloat(await demo.evaluate((element) => getComputedStyle(element).outlineWidth)),
    ).toBeGreaterThan(0)
  })

  test('opens the enabled Demo sign-in destination', async ({ page }) => {
    test.skip(demoDisabled, 'This case exercises the enabled Demo flag')
    await page.goto('/')

    await page.getByRole('link', { name: 'Open the HrizonMedia Demo' }).click()
    // The first Demo navigation can include cold compilation on the local test server.
    await expect(page).toHaveURL('/demo/sign-in?returnTo=%2Fdemo', { timeout: 60_000 })
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to the Demo')
  })

  test('keeps Demo navigation and access disabled when the production flag is off', async ({
    page,
  }) => {
    test.skip(!demoDisabled, 'Run with HRIZONMEDIA_DEMO_ENABLED=false')
    await page.goto('/')

    await expect(page.getByRole('link', { name: 'Open the HrizonMedia Demo' })).toHaveCount(0)
    const response = await page.goto('/demo')
    expect(response?.status()).toBe(404)
  })

  test('matches the approved desktop composition', async ({ page }) => {
    test.skip(demoDisabled, 'This case exercises the enabled Demo flag')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)

    await expect(page).toHaveScreenshot('hrizonmedia-home-desktop.png', {
      animations: 'disabled',
      fullPage: true,
    })
  })

  test('matches the approved mobile composition', async ({ page }) => {
    test.skip(demoDisabled, 'This case exercises the enabled Demo flag')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)

    await expect(page).toHaveScreenshot('hrizonmedia-home-mobile.png', {
      animations: 'disabled',
      fullPage: true,
    })
  })
})
