import { expect, test } from '@playwright/test'

test.describe('HrizonMedia landing page', () => {
  test('presents the approved secure-video identity and one Demo action', async ({ page }) => {
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
    await page.goto('/')

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(8, 8, 11)')
    await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-family', /Manrope/)

    const demo = page.getByRole('link', { name: 'Open the HrizonMedia Demo' })
    await expect(demo).toHaveCSS('background-color', 'rgb(243, 195, 12)')
    await expect(demo).toHaveCSS('color', 'rgb(8, 8, 11)')
  })

  test('provides complete brand metadata and icon variants', async ({ page }) => {
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
  })

  test('remains usable on a narrow screen and exposes keyboard focus', async ({ page }) => {
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
  })

  test('matches the approved desktop composition', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)

    await expect(page).toHaveScreenshot('hrizonmedia-home-desktop.png', {
      animations: 'disabled',
      fullPage: true,
    })
  })
})
