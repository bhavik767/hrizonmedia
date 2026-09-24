import { expect, test } from '@playwright/test'

function luminance(rgb: string) {
  const channels = rgb.match(/\d+/g)?.slice(0, 3).map(Number) ?? []
  return channels.reduce((sum, channel, index) => {
    const linear =
      channel / 255 <= 0.04045 ? channel / 255 / 12.92 : ((channel / 255 + 0.055) / 1.055) ** 2.4
    return sum + linear * [0.2126, 0.7152, 0.0722][index]
  }, 0)
}

function contrastRatio(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

test.describe('WeCloud landing page', () => {
  test('presents the WeCloud identity, secure-video features, and Dashboard entry points', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(page).toHaveTitle('WeCloud | Secure video. Precisely controlled.')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Secure video,under your control.',
    )
    await expect(page.getByRole('banner').getByRole('link', { name: 'WeCloud home' })).toBeVisible()
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'Open WeCloud Dashboard' }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open WeCloud Dashboard' })).toHaveCount(2)
    await expect(page.getByRole('heading', { name: 'Secure upload' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Protected playback' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Controlled access' })).toBeVisible()
    await expect(page.getByRole('contentinfo')).toContainText('wecloud.biz')

    const visibleCopy = await page.locator('body').innerText()
    expect(visibleCopy).not.toMatch(/HrizonMedia|Payload|eSaral|EncryptStream/)
  })

  test('uses the approved dark palette and accessible Dashboard action', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(8, 8, 11)')
    await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-family', /manrope/i)

    const dashboard = page.getByRole('link', { name: 'Open WeCloud Dashboard' })
    await expect(dashboard).toHaveCSS('background-color', 'rgb(243, 195, 12)')
    await expect(dashboard).toHaveCSS('color', 'rgb(8, 8, 11)')

    const colors = await dashboard.evaluate((element) => {
      const action = getComputedStyle(element)
      return { actionBackground: action.backgroundColor, actionText: action.color }
    })
    expect(contrastRatio(colors.actionText, colors.actionBackground)).toBeGreaterThanOrEqual(4.5)
  })

  test('publishes WeCloud metadata, structured data, and public brand assets', async ({
    page,
    request,
  }) => {
    await page.goto('/')

    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /WeCloud.*secure video platform/i,
    )
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /WeCloud/)
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /opengraph-image/,
    )
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
      'content',
      /twitter-image/,
    )
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://wecloud.biz',
    )
    await expect(page.locator('link[rel="icon"]')).toHaveCount(2)
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1)
    await expect(page.locator('img[src="/brand-lockup.svg"]')).toHaveCount(1)

    const structuredData = await page.locator('script[type="application/ld+json"]').textContent()
    expect(structuredData).not.toBeNull()
    expect(JSON.parse(structuredData!)).toMatchObject({
      '@type': 'WebSite',
      name: 'WeCloud',
      url: 'https://wecloud.biz/',
    })
    await expect.poll(async () => (await request.get('/brand-lockup.svg')).status()).toBe(200)
    await expect.poll(async () => (await request.get('/favicon.ico')).status()).toBe(200)
    await expect.poll(async () => (await request.get('/apple-touch-icon.png')).status()).toBe(200)
  })

  test('remains usable on a narrow screen and exposes keyboard focus', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(horizontalOverflow).toBeLessThanOrEqual(1)
    await expect(page.getByRole('link', { name: 'Open WeCloud Dashboard' })).toBeVisible()

    await page.keyboard.press('Tab')
    const skipLink = page.getByRole('link', { name: 'Skip to content' })
    await expect(skipLink).toBeFocused()
    await expect(skipLink).toBeVisible()

    await page.keyboard.press('Tab')
    const home = page.getByRole('banner').getByRole('link', { name: 'WeCloud home' })
    await expect(home).toBeFocused()
    expect(
      Number.parseFloat(await home.evaluate((element) => getComputedStyle(element).outlineWidth)),
    ).toBeGreaterThan(0)

    await page.keyboard.press('Tab')
    const dashboard = page.getByRole('banner').getByRole('link', { name: 'Open WeCloud Dashboard' })
    await expect(dashboard).toBeFocused()
    expect(
      Number.parseFloat(
        await dashboard.evaluate((element) => getComputedStyle(element).outlineWidth),
      ),
    ).toBeGreaterThan(0)
  })

  test('opens the existing Dashboard sign-in destination', async ({ page }) => {
    test.skip(
      process.env.HRIZONMEDIA_DEMO_ENABLED !== 'true',
      'The Dashboard route is enabled only in the dedicated workspace environment',
    )
    await page.goto('/')

    await page.getByRole('link', { name: 'Open WeCloud Dashboard' }).click()
    await expect(page).toHaveURL('/demo/sign-in?returnTo=%2Fdemo', { timeout: 60_000 })
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to the Dashboard')
  })

  test('keeps the Dashboard route disabled when the production flag is off', async ({ page }) => {
    test.skip(
      process.env.HRIZONMEDIA_DEMO_ENABLED !== 'false',
      'Run with HRIZONMEDIA_DEMO_ENABLED=false',
    )
    await page.goto('/')

    await expect(page.getByRole('link', { name: 'Open WeCloud Dashboard' })).toHaveCount(2)
    const response = await page.goto('/demo')
    expect(response?.status()).toBe(404)
  })

  test('matches the approved desktop composition', async ({ page }) => {
    test.skip(
      process.env.HRIZONMEDIA_DEMO_ENABLED !== 'true',
      'This case exercises the enabled Dashboard route',
    )
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)

    await expect(page).toHaveScreenshot('wecloud-home-desktop.png', {
      animations: 'disabled',
      fullPage: true,
    })
  })

  test('matches the approved mobile composition', async ({ page }) => {
    test.skip(
      process.env.HRIZONMEDIA_DEMO_ENABLED !== 'true',
      'This case exercises the enabled Dashboard route',
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)

    await expect(page).toHaveScreenshot('wecloud-home-mobile.png', {
      animations: 'disabled',
      fullPage: true,
    })
  })
})
