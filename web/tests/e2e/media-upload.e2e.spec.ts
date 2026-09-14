import { expect, test, type Page } from '@playwright/test'
import { getPayload } from 'payload'

import config from '@/payload.config'

import {
  cleanupPilotMembers,
  seedPilotUploaders,
  testInvitee,
  testOperator,
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
    await expect(asset.getByText('ready', { exact: true })).toBeVisible({ timeout: 45_000 })

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

  test('issue 38: deletes an owned Media Asset and removes it from the library immediately', async ({
    page,
  }) => {
    await signIn(page, testInvitee)
    await page.getByLabel('Video file').setInputFiles({
      buffer: mp4Fixture(),
      mimeType: 'video/mp4',
      name: 'delete-me.mp4',
    })
    await page.getByRole('button', { name: 'Upload asset' }).click()
    const asset = page.getByRole('article', { name: 'delete-me.mp4' })
    await expect(asset.getByText('ready', { exact: true })).toBeVisible({ timeout: 45_000 })
    await asset.getByRole('link', { name: 'Inspect asset' }).click()

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Delete asset' }).click()

    await expect(page).toHaveURL('/demo')
    await expect(page.getByText('Your library is empty.')).toBeVisible()
  })

  test('issue 38: keeps an expired Media Asset visible while blocking new playback', async ({
    page,
  }) => {
    await signIn(page, testInvitee)
    await page.getByLabel('Video file').setInputFiles({
      buffer: mp4Fixture(),
      mimeType: 'video/mp4',
      name: 'expired-lesson.mp4',
    })
    await page.getByRole('button', { name: 'Upload asset' }).click()
    const asset = page.getByRole('article', { name: 'expired-lesson.mp4' })
    await expect(asset.getByText('ready', { exact: true })).toBeVisible({ timeout: 45_000 })
    const detailURL = await asset.getByRole('link', { name: 'Inspect asset' }).getAttribute('href')
    const mediaAssetId = detailURL!.split('/').at(-1)!
    const payload = await getPayload({ config })
    await payload.update({
      collection: 'media-assets',
      data: { expiresAt: new Date(Date.now() - 1).toISOString() },
      overrideAccess: true,
      where: { mediaAssetId: { equals: mediaAssetId } },
    })

    await page.reload()
    await expect(asset.getByText('expired', { exact: true })).toBeVisible({ timeout: 45_000 })
    await asset.getByRole('link', { name: 'Inspect asset' }).click()
    await expect(page.getByRole('heading', { name: 'Secure playback' })).toHaveCount(0)
    const grant = await page.request.post(`/api/demo/assets/${mediaAssetId}/playback-grants`)
    expect(grant.status()).toBe(409)
  })

  test('issue 38: lets an operator inspect and delete another uploader’s Media Asset', async ({
    page,
  }) => {
    await signIn(page, testInvitee)
    await page.getByLabel('Video file').setInputFiles({
      buffer: mp4Fixture(),
      mimeType: 'video/mp4',
      name: 'operator-delete.mp4',
    })
    await page.getByRole('button', { name: 'Upload asset' }).click()
    const asset = page.getByRole('article', { name: 'operator-delete.mp4' })
    await expect(asset.getByText('ready', { exact: true })).toBeVisible({ timeout: 45_000 })
    const payload = await getPayload({ config })
    await payload.create({
      collection: 'pilot-members',
      data: {
        ...testOperator,
        invitationAcceptedAt: new Date().toISOString(),
        role: 'operator',
        status: 'active',
      },
      overrideAccess: true,
    })
    await page.getByRole('button', { name: 'Sign out' }).click()
    await signIn(page, testOperator)

    await expect(page.getByLabel('Video file')).toHaveCount(0)
    const operatorAsset = page.getByRole('article', { name: 'operator-delete.mp4' })
    await operatorAsset.getByRole('link', { name: 'Inspect asset' }).click()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Delete asset' }).click()

    await expect(page).toHaveURL('/demo')
    await expect(page.getByText('Your library is empty.')).toBeVisible()
  })

  test('retries a transient part failure without restarting completed parts', async ({ page }) => {
    const partRequests = new Map<string, number>()
    await page.route(/\/api\/demo\/uploads\/upload_.+\/parts\/(\d+)\/content$/, async (route) => {
      const partNumber = route.request().url().split('/').at(-2)!
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
      buffer: mp4Fixture(60, 5 * 1024 * 1024 + 1),
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
    await page.route(/\/api\/demo\/uploads\/upload_.+\/parts\/(\d+)\/content$/, async (route) => {
      const partNumber = route.request().url().split('/').at(-2)!
      partRequests.set(partNumber, (partRequests.get(partNumber) || 0) + 1)
      if (partNumber === '2' && interruptSecondPart) {
        await route.abort('connectionfailed')
        return
      }
      await route.continue()
    })

    const file = {
      buffer: mp4Fixture(60, 5 * 1024 * 1024 + 1),
      mimeType: 'video/mp4',
      name: 'resume-lesson.mp4',
    }
    await signIn(page, testInvitee)
    await page.getByLabel('Video file').setInputFiles(file)
    await page.getByRole('button', { name: 'Upload asset' }).click()
    await expect(page.locator('.form-message[role="alert"]')).toContainText(
      'Reselect this file to resume',
      { timeout: 45_000 },
    )
    expect(partRequests.get('1')).toBe(1)

    interruptSecondPart = false
    await page.reload()
    await page.getByLabel('Video file').setInputFiles(file)
    await page.getByRole('button', { name: 'Upload asset' }).click()

    await expect(
      page.getByRole('article', { name: 'resume-lesson.mp4' }).getByText('ready'),
    ).toBeVisible({ timeout: 45_000 })
    expect(partRequests.get('1')).toBe(1)
  })

  test('rejects a changed file before combining it with completed parts', async ({ page }) => {
    let interruptSecondPart = true
    await page.route(/\/api\/demo\/uploads\/upload_.+\/parts\/2\/content$/, async (route) => {
      if (interruptSecondPart) {
        await route.abort('connectionfailed')
        return
      }
      await route.continue()
    })

    const original = mp4Fixture(60, 5 * 1024 * 1024 + 1)
    const changed = Buffer.from(original)
    changed[1024 * 1024] = 1
    const file = { buffer: original, mimeType: 'video/mp4', name: 'changed-lesson.mp4' }
    await signIn(page, testInvitee)
    await page.getByLabel('Video file').setInputFiles(file)
    await page.getByRole('button', { name: 'Upload asset' }).click()
    await expect(page.locator('.form-message[role="alert"]')).toContainText(
      'Reselect this file to resume',
    )

    interruptSecondPart = false
    await page.reload()
    await page.getByLabel('Video file').setInputFiles({ ...file, buffer: changed })
    await page.getByRole('button', { name: 'Upload asset' }).click()
    await expect(page.locator('.form-message[role="alert"]')).toContainText(
      'does not match the completed upload parts',
    )
  })

  test('shows a sanitized failure and lets the uploader retry while the source exists', async ({
    page,
  }) => {
    await signIn(page, testInvitee)
    await page.getByLabel('Video file').setInputFiles({
      buffer: mp4Fixture(),
      mimeType: 'video/mp4',
      name: 'retryable-lesson.mp4',
    })
    await page.getByRole('button', { name: 'Upload asset' }).click()
    const asset = page.getByRole('article', { name: 'retryable-lesson.mp4' })
    await expect(asset.getByText('ready', { exact: true })).toBeVisible()
    const detailLink = asset.getByRole('link', { name: 'Inspect asset' })
    const mediaAssetId = (await detailLink.getAttribute('href'))!.split('/').at(-1)!
    await detailLink.click()
    await expect(page).toHaveURL(new RegExp(`/demo/assets/${mediaAssetId}$`))

    const payload = await getPayload({ config })
    const assets = await payload.find({
      collection: 'media-assets',
      limit: 1,
      overrideAccess: true,
      where: { mediaAssetId: { equals: mediaAssetId } },
    })
    await payload.update({
      collection: 'processing-jobs',
      data: {
        failedAt: new Date().toISOString(),
        failureMessage:
          'Processing could not be completed. You can retry while the source is available.',
        status: 'failed',
      },
      overrideAccess: true,
      where: { asset: { equals: assets.docs[0]!.id } },
    })
    await payload.update({
      collection: 'media-assets',
      data: { status: 'failed', statusChangedAt: new Date().toISOString() },
      id: assets.docs[0]!.id,
      overrideAccess: true,
    })

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Processing failed' })).toBeVisible()
    await expect(
      page.getByText(
        'Processing could not be completed. You can retry while the source is available.',
      ),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Retry processing' }).click()
    await expect(page.getByText('processing', { exact: true })).toBeVisible()
  })
})
