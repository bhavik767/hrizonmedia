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
    await page.getByRole('button', { name: 'Start secure playback' }).click()

    const video = page.getByTestId('secure-video')
    await expect(video).toHaveAttribute('controlslist', /nodownload/)
    await expect(video).toHaveAttribute('disablepictureinpicture', '')
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
      })
  })
})
