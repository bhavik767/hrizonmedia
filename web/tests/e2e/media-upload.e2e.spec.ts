import { expect, test, type Page } from '@playwright/test'
import { getPayload } from 'payload'

import config from '../../src/payload.config.js'

import {
  cleanupPilotMembers,
  seedPilotUploaders,
  testInvitee,
  testSecondUploader,
} from '../helpers/seedPilotMembers'

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
      buffer: Buffer.from('000000186674797069736f6d0000020069736f6d', 'hex'),
      mimeType: 'video/mp4',
      name: 'private-lesson.mp4',
    })
    await page.getByRole('button', { name: 'Upload asset' }).click()

    const asset = page.getByRole('article', { name: 'private-lesson.mp4' })
    await expect(asset.getByText('uploading', { exact: true })).toBeVisible()
    await expect(asset.getByText('queued', { exact: true })).toBeVisible()
    await expect(asset.getByText('processing', { exact: true })).toBeVisible()
    await expect(asset.getByText('ready', { exact: true })).toBeVisible()

    await asset.getByRole('link', { name: 'Inspect asset' }).click()
    await expect(page.getByRole('heading', { name: 'private-lesson.mp4' })).toBeVisible()
    await expect(page.getByText('Media Asset ID')).toBeVisible()
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

  test('shows a sanitized failure and lets the uploader retry while the source exists', async ({
    page,
  }) => {
    await signIn(page, testInvitee)
    await page.getByLabel('Video file').setInputFiles({
      buffer: Buffer.from('000000186674797069736f6d0000020069736f6d', 'hex'),
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
