import { expect, test, type Page } from '@playwright/test'

import { cleanupPilotMembers, seedPilotUploaders, testInvitee } from '../helpers/seedPilotMembers'
import { mp4Fixture } from '../helpers/mediaFixtures'

async function signIn(page: Page) {
  await page.goto('/demo/sign-in')
  await page.getByLabel('Email').fill(testInvitee.email)
  await page.getByLabel('Password').fill(testInvitee.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/demo', { timeout: 60_000 })
}

test.describe('encrypted playback contract', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
    await seedPilotUploaders()
  })

  test.afterEach(async () => {
    await cleanupPilotMembers()
  })

  test('initializes Shaka with temporary Widevine playback and restricted controls', async ({
    page,
  }) => {
    await signIn(page)
    await page.getByLabel('Video file').setInputFiles({
      buffer: mp4Fixture(),
      mimeType: 'video/mp4',
      name: 'encrypted-lesson.mp4',
    })
    await page.getByRole('button', { name: 'Upload asset' }).click()
    const asset = page.getByRole('article', { name: 'encrypted-lesson.mp4' })
    await expect(asset.getByText('ready', { exact: true })).toBeVisible({ timeout: 45_000 })
    await asset.getByRole('link', { name: 'Inspect asset' }).click()

    await page.evaluate(() => {
      window.addEventListener('hrizonmedia:shaka-configured', ((event: CustomEvent) => {
        Object.assign(window, { playbackConfiguration: event.detail })
      }) as EventListener)
    })
    const grantResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/playback-grants') && response.request().method() === 'POST',
    )
    const manifestResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/manifest.mpd'),
    )
    await page.getByRole('button', { name: 'Start secure playback' }).click()

    const grantResponse = await grantResponsePromise
    expect(grantResponse.status()).toBe(201)
    const grant = (await grantResponse.json()) as {
      licenceURL: string
      playbackGrantToken: string
    }
    expect((await manifestResponsePromise).status()).toBe(200)
    const licenceResponse = await page.request.post(grant.licenceURL, {
      data: Buffer.from('deterministic-widevine-challenge'),
      headers: { 'X-Playback-Grant': grant.playbackGrantToken },
    })
    expect(licenceResponse.status()).toBe(200)

    const video = page.getByTestId('secure-video')
    await expect(video).toHaveAttribute('controlslist', /nodownload/)
    await expect(video).toHaveAttribute('disablepictureinpicture', '')
    await expect(page.getByRole('button', { exact: true, name: 'Play' })).toBeVisible()
    await expect(page.getByRole('button', { exact: true, name: 'Mute' })).toBeVisible()
    await expect(page.getByRole('button', { exact: true, name: 'Full screen' })).toBeVisible()
    await page.getByRole('button', { exact: true, name: 'More settings' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { exact: true, name: 'Playback speed' })).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as typeof window & { playbackConfiguration?: unknown }).playbackConfiguration,
        ),
      )
      .toMatchObject({
        distinctiveIdentifierRequired: false,
        keySystem: 'com.widevine.alpha',
        persistentSessionOnlinePlayback: false,
        persistentStateRequired: false,
        sessionType: 'temporary',
        ui: {
          addSeekBar: true,
          overflowMenuButtons: ['quality', 'playback_rate'],
          playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
        },
      })
  })

  test('attributes recordings with a moving disclosed watermark, including in fullscreen', async ({
    page,
  }) => {
    await signIn(page)
    await page.getByLabel('Video file').setInputFiles({
      buffer: mp4Fixture(),
      mimeType: 'video/mp4',
      name: 'watermarked-lesson.mp4',
    })
    await page.getByRole('button', { name: 'Upload asset' }).click()
    const asset = page.getByRole('article', { name: 'watermarked-lesson.mp4' })
    await expect(asset.getByText('ready', { exact: true })).toBeVisible({ timeout: 45_000 })
    await asset.getByRole('link', { name: 'Inspect asset' }).click()

    const watermark = page.getByTestId('viewer-watermark')
    await expect(watermark).toContainText(testInvitee.email)
    await expect(watermark.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/)
    const initialPosition = await watermark.getAttribute('data-position')
    await expect.poll(() => watermark.getAttribute('data-position'), { timeout: 10_000 }).not.toBe(
      initialPosition,
    )

    await expect(page.getByText(/Your full email and the current timestamp move across playback/)).toBeVisible()
    await page.getByRole('button', { name: 'Start secure playback' }).click()
    await page.getByRole('button', { exact: true, name: 'Full screen' }).click()
    await expect(watermark).toBeVisible()
    await page.keyboard.press('Escape')
    if (await page.evaluate(() => document.fullscreenElement !== null)) {
      await page.evaluate(() => document.exitFullscreen())
    }
    await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull()

    await page.setViewportSize({ height: 844, width: 390 })
    await expect(watermark).toBeVisible()
    const watermarkBox = await watermark.boundingBox()
    expect(watermarkBox).not.toBeNull()
    expect(watermarkBox!.x).toBeGreaterThanOrEqual(0)
    expect(watermarkBox!.x + watermarkBox!.width).toBeLessThanOrEqual(390)

    await expect(page.getByRole('link', { name: 'Pilot terms' })).toHaveAttribute(
      'href',
      '/demo/terms',
    )
    await page.goto('/demo/terms')
    await expect(page).toHaveURL('/demo/terms')
    await expect(page.getByRole('heading', { name: 'Pilot terms' })).toBeVisible()
    await expect(page.getByText(/full Pilot Member email and a current timestamp/)).toBeVisible()
  })
})
