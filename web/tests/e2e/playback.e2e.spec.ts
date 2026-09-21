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

async function openReadyAsset(page: Page, fileName: string) {
  await signIn(page)
  await page.getByLabel('Video file').setInputFiles({
    buffer: mp4Fixture(),
    mimeType: 'video/mp4',
    name: fileName,
  })

  test('issues Safari a FairPlay HLS grant and rejects its DASH package route', async ({
    page,
  }) => {
    await openReadyAsset(page, 'fairplay-lesson.mp4')
    const mediaAssetId = page.url().split('/').at(-1)!
    const origin = new URL(page.url()).origin
    const grantResponse = await page.request.post(
      `/api/demo/assets/${mediaAssetId}/playback-grants`,
      {
        headers: {
          Origin: origin,
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
          'X-Hrizonmedia-Fairplay': 'available',
          'X-Hrizonmedia-Widevine': 'unavailable',
        },
      },
    )
    expect(grantResponse.status()).toBe(201)
    const grant = (await grantResponse.json()) as {
      fairPlayCertificateURL: string
      keySystem: string
      licenceURL: string
      manifestFormat: string
      manifestURL: string
      playbackGrantToken: string
    }
    expect(grant).toMatchObject({
      fairPlayCertificateURL: expect.stringContaining('/fairplay-certificate'),
      keySystem: 'com.apple.fps',
      manifestFormat: 'hls',
    })
    const master = await page.request.get(grant.manifestURL)
    expect(master.status()).toBe(200)
    const masterPlaylist = await master.text()
    expect(masterPlaylist).toContain('/fairplay.m3u8')
    const mediaPlaylist = await page.request.get(
      masterPlaylist.match(/\/api\/demo\/playback\/[^\n]+fairplay\.m3u8\?[^\n]+/)![0],
    )
    expect(mediaPlaylist.status()).toBe(200)
    expect(await mediaPlaylist.text()).toContain(
      'KEYFORMAT="com.apple.streamingkeydelivery"',
    )
    const certificate = await page.request.get(grant.fairPlayCertificateURL)
    expect(certificate.status()).toBe(200)
    expect(certificate.headers()['content-type']).toBe('application/octet-stream')
    const dash = await page.request.get(grant.manifestURL.replace('/master.m3u8', '/manifest.mpd'))
    expect(dash.status()).toBe(403)
    const licence = await page.request.post(grant.licenceURL, {
      data: Buffer.from('deterministic-fairplay-spc'),
      headers: { Origin: origin, 'X-Playback-Grant': grant.playbackGrantToken },
    })
    expect(licence.status()).toBe(200)
  })
  await page.getByRole('button', { name: 'Upload asset' }).click()
  const asset = page.getByRole('article', { name: fileName })
  await expect(asset.getByText('ready', { exact: true })).toBeVisible({ timeout: 45_000 })
  await asset.getByRole('link', { name: 'Inspect asset' }).click()
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
    await openReadyAsset(page, 'encrypted-lesson.mp4')

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
      watermark: { issuedAt: string; leakId: string }
    }
    expect(grant.watermark).toMatchObject({
      issuedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      leakId: expect.stringMatching(/^lk_[A-Za-z0-9_-]{16}$/),
    })
    const manifestResponse = await manifestResponsePromise
    expect(manifestResponse.status()).toBe(200)
    const manifest = await manifestResponse.text()
    expect(manifest).toContain('id="video-360"')
    expect(manifest).toContain('id="video-1080"')
    expect(manifest).toContain('/video-360-init.mp4')
    expect(manifest).toContain('/video-1080-init.mp4')
    expect(manifest).toContain('/audio-init.mp4')
    const licenceResponse = await page.request.post(grant.licenceURL, {
      data: Buffer.from('deterministic-widevine-challenge'),
      headers: {
        Origin: new URL(page.url()).origin,
        'X-Playback-Grant': grant.playbackGrantToken,
      },
    })
    expect(licenceResponse.status()).toBe(200)

    const video = page.getByTestId('secure-video')
    await expect(video).toHaveAttribute('controlslist', /nodownload/)
    await expect(video).toHaveAttribute('disablepictureinpicture', '')
    await expect(video).toHaveAttribute('aria-describedby', 'playback-watermark-notice')
    await expect(page.getByRole('button', { exact: true, name: 'Play' })).toBeVisible()
    await expect(page.getByRole('button', { exact: true, name: 'Mute' })).toBeVisible()
    await expect(page.getByRole('button', { exact: true, name: 'Full screen' })).toBeVisible()
    const volume = page.getByRole('slider', { name: 'Volume' })
    await volume.focus()
    await page.keyboard.press('ArrowDown')
    await expect(volume).toHaveValue('99')
    await page.getByRole('button', { exact: true, name: 'More settings' }).focus()
    await page.keyboard.press('Enter')
    const playbackSpeed = page.getByRole('button', { exact: true, name: 'Playback speed' })
    await expect(playbackSpeed).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as typeof window & { playbackConfiguration?: unknown }).playbackConfiguration,
        ),
      )
      .toMatchObject({
        distinctiveIdentifierRequired: false,
        hdcpRequired: false,
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

  test('shows a browser-compatibility reason without issuing a playback fallback', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:3103',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
    })
    const page = await context.newPage()

    try {
      await openReadyAsset(page, 'unsupported-browser-lesson.mp4')
      let requestedGrant = false
      page.on('request', (request) => {
        if (request.url().includes('/playback-grants') && request.method() === 'POST') {
          requestedGrant = true
        }
      })
      await page.getByRole('button', { name: 'Start secure playback' }).click()

      await expect(page.locator('.secure-playback__status')).toHaveText(
        'Secure playback is not supported by this browser. Use current Safari with FairPlay DRM, or Chrome or Microsoft Edge with Widevine DRM enabled.',
      )
      expect(requestedGrant).toBe(false)
      const mediaAssetId = page.url().split('/').at(-1)!
      const manifest = await page.request.get(
        `/api/demo/playback/playback_00000000-0000-4000-8000-000000000000/manifest.mpd?asset=${mediaAssetId}&token=invalid`,
      )
      expect(manifest.status()).toBe(401)
      await expect(page.getByTestId('secure-video')).not.toHaveAttribute('src', /./)
    } finally {
      await context.close()
    }
  })

  test('attributes recordings with a rotating Leak ID watermark, including in fullscreen', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await openReadyAsset(page, 'watermarked-lesson.mp4')

    const watermark = page.getByTestId('viewer-watermark')
    await expect(watermark).not.toBeVisible()
    const rotationResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/watermark') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Start secure playback' }).click()
    await expect(watermark).toHaveAccessibleName('Recording attribution watermark')
    await expect(watermark).not.toContainText(testInvitee.email)
    await expect(watermark.locator('span')).toHaveText(/^lk_[A-Za-z0-9_-]{16}$/)
    await expect(watermark.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/)
    const initialLeakId = await watermark.locator('span').textContent()
    const initialPosition = await watermark.getAttribute('data-position')
    const rotationResponse = await rotationResponsePromise
    expect(rotationResponse.status()).toBe(200)
    const rotation = (await rotationResponse.json()) as { leakId: string }
    expect(rotation.leakId).not.toBe(initialLeakId)
    await expect(watermark.locator('span')).toHaveText(rotation.leakId)
    await expect.poll(() => watermark.getAttribute('data-position')).not.toBe(initialPosition)

    await expect(
      page.getByText(/compact Leak ID and server-issued timestamp move across playback/),
    ).toBeVisible()
    await expect(page.locator('.secure-playback__status')).toHaveText(
      'Secure playback could not start. Request a fresh grant and try again.',
    )
    await page.getByRole('button', { exact: true, name: 'Full screen' }).focus()
    await page.keyboard.press('Enter')
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.fullscreenElement?.classList.contains('secure-playback__video'),
        ),
      )
      .toBe(true)
    await expect(watermark).toBeVisible()
    await page.keyboard.press('Escape')
    if (await page.evaluate(() => document.fullscreenElement !== null)) {
      await page.evaluate(() => document.exitFullscreen())
    }
    await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull()

    await page.setViewportSize({ height: 844, width: 390 })
    await expect(watermark).toBeVisible()
    const playerBox = await page.locator('.secure-playback__video').boundingBox()
    expect(playerBox).not.toBeNull()
    expect(playerBox!.x + playerBox!.width).toBeLessThanOrEqual(390)
    const watermarkBox = await watermark.boundingBox()
    expect(watermarkBox).not.toBeNull()
    expect(watermarkBox!.x).toBeGreaterThanOrEqual(0)
    expect(watermarkBox!.x + watermarkBox!.width).toBeLessThanOrEqual(390)

    await watermark.evaluate((element) => element.setAttribute('data-position', 'top-left'))
    await expect(page.locator('.secure-playback')).toHaveScreenshot('secure-player-mobile.png', {
      animations: 'disabled',
      mask: [watermark.locator('time')],
      maxDiffPixelRatio: 0.015,
    })

    await expect(page.getByRole('link', { name: 'Pilot terms' })).toHaveAttribute(
      'href',
      '/demo/terms',
    )
    await page.goto('/demo/terms')
    await expect(page).toHaveURL('/demo/terms')
    await expect(page.getByRole('heading', { name: 'Pilot terms' })).toBeVisible()
    await expect(
      page.getByText(/compact, opaque Leak ID and a server-issued timestamp/),
    ).toBeVisible()
  })
})
