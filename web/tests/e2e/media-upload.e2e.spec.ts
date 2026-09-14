import { expect, test, type Page } from '@playwright/test'

import {
  cleanupPilotMembers,
  seedPilotUploaders,
  testInvitee,
  testSecondUploader,
} from '../helpers/seedPilotMembers'
import { mp4Fixture } from '../helpers/mediaFixtures'

async function signIn(page: Page, member: { email: string; password: string }) {
  await page.goto('/demo/sign-in')
  await page.getByLabel('Email').fill(member.email)
  await page.getByLabel('Password').fill(member.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/demo', { timeout: 60_000 })
}

test.describe('Media Asset tracer bullet', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
    await seedPilotUploaders()
  })

  test.afterEach(async () => {
    await cleanupPilotMembers()
  })

  test('uploads a valid fixture to ready while keeping it private to its uploader', async ({
    page,
  }) => {
    await signIn(page, testInvitee)
    await expect(page.getByText('Your library is empty.')).toBeVisible()

    await page.getByLabel('Video file').setInputFiles({
      buffer: mp4Fixture(),
      mimeType: 'video/mp4',
      name: 'private-lesson.mp4',
    })
    await page.getByRole('button', { name: 'Upload asset' }).click()

    const asset = page.getByRole('article', { name: 'private-lesson.mp4' })
    await expect(asset.getByText('uploading', { exact: true })).toBeVisible()
    await expect(asset.getByText('queued', { exact: true })).toBeVisible({ timeout: 45_000 })
    await expect(asset.getByText('processing', { exact: true })).toBeVisible()
    await expect(asset.getByText('ready', { exact: true })).toBeVisible()

    await asset.getByRole('link', { name: 'Inspect asset' }).click()
    await expect(page).toHaveURL(/\/demo\/assets\//, { timeout: 45_000 })
    await expect(page.getByRole('heading', { name: 'private-lesson.mp4' })).toBeVisible({
      timeout: 45_000,
    })
    await expect(page.getByText('Media Asset ID')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByText('Upload Session ID')).toBeVisible()
    await expect(page.getByText('Processing Job ID')).toBeVisible()
    await expect(page.getByText('Provider Job ID')).toBeVisible()
    const assetID = page.url().split('/').at(-1)
    expect(assetID).toMatch(/^asset_/)

    await page.getByRole('button', { name: 'Sign out' }).click()
    await signIn(page, testSecondUploader)
    await expect(page.getByText('Your library is empty.')).toBeVisible()

    const denied = await page.request.get(`/api/demo/assets/${assetID}`)
    expect(denied.status()).toBe(404)
  })

  test('retries a transient part failure without restarting completed parts', async ({ page }) => {
    const partRequests = new Map<string, number>()
    await page.route(/\/api\/demo\/uploads\/upload_.+\/parts\/(\d+)/, async (route) => {
      const partNumber = route.request().url().split('/').at(-1)!
      partRequests.set(partNumber, (partRequests.get(partNumber) || 0) + 1)
      if (partNumber === '2' && partRequests.get(partNumber) === 1) {
        await route.fulfill({
          body: JSON.stringify({ error: 'Temporary storage failure.' }),
          status: 503,
        })
        return
      }
      await route.continue()
    })

    await signIn(page, testInvitee)
    await page.getByLabel('Video file').setInputFiles({
      buffer: mp4Fixture(),
      mimeType: 'video/mp4',
      name: 'retry-lesson.mp4',
    })
    await page.getByRole('button', { name: 'Upload asset' }).click()

    await expect(
      page.getByRole('article', { name: 'retry-lesson.mp4' }).getByText('ready'),
    ).toBeVisible()
    expect(partRequests.get('1')).toBe(1)
    expect(partRequests.get('2')).toBe(2)
  })

  test('resumes completed parts after reload when the same file is reselected', async ({
    page,
  }) => {
    const partRequests = new Map<string, number>()
    let interruptSecondPart = true
    await page.route(/\/api\/demo\/uploads\/upload_.+\/parts\/(\d+)/, async (route) => {
      const partNumber = route.request().url().split('/').at(-1)!
      partRequests.set(partNumber, (partRequests.get(partNumber) || 0) + 1)
      if (partNumber === '2' && interruptSecondPart) {
        await route.abort('connectionfailed')
        return
      }
      await route.continue()
    })

    const file = { buffer: mp4Fixture(), mimeType: 'video/mp4', name: 'resume-lesson.mp4' }
    await signIn(page, testInvitee)
    await page.getByLabel('Video file').setInputFiles(file)
    await page.getByRole('button', { name: 'Upload asset' }).click()
    await expect(page.locator('.form-message[role="alert"]')).toContainText(
      'Reselect this file to resume',
    )
    expect(partRequests.get('1')).toBe(1)

    interruptSecondPart = false
    await page.reload()
    await page.getByLabel('Video file').setInputFiles(file)
    await page.getByRole('button', { name: 'Upload asset' }).click()

    await expect(
      page.getByRole('article', { name: 'resume-lesson.mp4' }).getByText('ready'),
    ).toBeVisible()
    expect(partRequests.get('1')).toBe(1)
  })
})
