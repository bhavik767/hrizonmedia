import { expect, test, type Page } from '@playwright/test'
import { getPayload } from 'payload'
import { randomUUID } from 'node:crypto'

import config from '@/payload.config'
import type { MediaAssetStatus } from '@/media/types'

import {
  cleanupMembers,
  seedUploaders,
  testInvitee,
  testOperator,
  testSecondUploader,
} from '../helpers/seedMembers'
import { mp4Fixture } from '../helpers/mediaFixtures'

async function signIn(page: Page, member: { email: string; password: string }) {
  await page.goto('/demo/sign-in')
  await page.getByLabel('Email').fill(member.email)
  await page.getByLabel('Password').fill(member.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/demo', { timeout: 60_000 })
}

async function uploadVideo(page: Page, file: { buffer: Buffer; mimeType: string; name: string }) {
  await page.getByRole('button', { name: 'Upload Video' }).click()
  await page.getByLabel('Video file').setInputFiles(file)
  await page.getByRole('button', { name: 'Start Upload' }).click()
}

async function seedWorkspaceAsset(status: MediaAssetStatus, name: string, size: number) {
  const payload = await getPayload({ config })
  const member = await payload.find({
    collection: 'members',
    overrideAccess: true,
    where: { email: { equals: testInvitee.email } },
  })
  const organisation = await payload.find({
    collection: 'organisations',
    overrideAccess: true,
    where: { name: { equals: `${testInvitee.name} Organisation` } },
  })
  const owner = member.docs[0]!
  const tenant = organisation.docs[0]!
  const now = new Date().toISOString()
  const asset = await payload.create({
    collection: 'media-assets',
    overrideAccess: true,
    data: {
      mediaAssetId: `asset_${randomUUID()}`,
      organisation: tenant.id,
      owner: owner.id,
      fileName: name,
      mimeType: 'video/mp4',
      size,
      status,
      statusChangedAt: now,
      mediaProtectionPolicy: 'protected',
    },
  })
  await payload.create({
    collection: 'upload-sessions',
    overrideAccess: true,
    data: {
      uploadSessionId: `upload_${randomUUID()}`,
      organisation: tenant.id,
      asset: asset.id,
      owner: owner.id,
      fileName: name,
      mimeType: 'video/mp4',
      size,
      fileFingerprint: randomUUID(),
      providerUploadId: `provider_upload_${randomUUID()}`,
      partSize: 1024,
      objectKey: status === 'failed' ? `sources/${asset.mediaAssetId}` : undefined,
      status: 'completed',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
  })
  if (status === 'ready' || status === 'failed') {
    await payload.create({
      collection: 'processing-jobs',
      overrideAccess: true,
      data: {
        processingJobId: `processing_${randomUUID()}`,
        organisation: tenant.id,
        asset: asset.id,
        owner: owner.id,
        status,
        queuedAt: now,
        dispatchBy: now,
        nextAttemptAt: now,
        attempts: 0,
        objectKey: `sources/${asset.mediaAssetId}`,
        sourceWidth: 1920,
        sourceHeight: 1080,
        sourceDurationSeconds: 60,
        renditions:
          status === 'ready'
            ? [
                { width: 640, height: 360, audioCodec: 'aac', videoCodec: 'h264' },
                { width: 1280, height: 720, audioCodec: 'aac', videoCodec: 'h264' },
              ]
            : [],
        readyAt: status === 'ready' ? now : undefined,
        failureMessage: status === 'failed' ? 'Processing could not be completed.' : undefined,
      },
    })
  }
  return asset.mediaAssetId
}

async function controlMultipartUpload(
  page: Page,
  options: { interruptPartNumber?: number; partSize: number },
) {
  let activeTransfers = 0
  let interruptTransfers = Boolean(options.interruptPartNumber)
  let maximumConcurrentTransfers = 0
  let uploadMetadata: { fileName: string; size: number } | null = null
  const completedParts = new Map<
    number,
    { checksumSHA256: string; etag: string; partNumber: number; size: number }
  >()
  const partMetadata = new Map<number, { checksumSHA256: string; size: number }>()
  const partRequests = new Map<number, number>()
  const partSizes = new Map<number, number>()

  const sessionResponse = () => {
    if (!uploadMetadata) throw new Error('Upload metadata was not received.')
    return {
      asset: {
        createdAt: new Date().toISOString(),
        fileName: uploadMetadata.fileName,
        mediaAssetId: 'asset_00000000-0000-0000-0000-000000000147',
        size: uploadMetadata.size,
        status: 'uploading',
      },
      completeURL: '/controlled-upload/complete',
      completedParts: [...completedParts.values()],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      partSize: options.partSize,
      partTargetURL: '/controlled-upload/parts/{partNumber}/target',
      uploadSessionId: 'upload_00000000-0000-0000-0000-000000000147',
    }
  }

  await page.route(/\/api\/demo\/uploads$/, async (route) => {
    uploadMetadata = route.request().postDataJSON() as { fileName: string; size: number }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(sessionResponse()),
    })
  })
  await page.route(
    /\/api\/demo\/uploads\/upload_00000000-0000-0000-0000-000000000147\?/,
    async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(sessionResponse()),
      })
    },
  )
  await page.route(/\/controlled-upload\/parts\/(\d+)\/target$/, async (route) => {
    const partNumber = Number(route.request().url().split('/').at(-2))
    partMetadata.set(
      partNumber,
      route.request().postDataJSON() as { checksumSHA256: string; size: number },
    )
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        headers: {},
        uploadURL: `/controlled-upload/parts/${partNumber}/content`,
      }),
    })
  })
  await page.route(/\/controlled-upload\/parts\/(\d+)\/content$/, async (route) => {
    const partNumber = Number(route.request().url().split('/').at(-2))
    const metadata = partMetadata.get(partNumber)!
    partRequests.set(partNumber, (partRequests.get(partNumber) ?? 0) + 1)
    partSizes.set(partNumber, route.request().postDataBuffer()?.byteLength ?? 0)
    activeTransfers += 1
    maximumConcurrentTransfers = Math.max(maximumConcurrentTransfers, activeTransfers)
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        interruptTransfers && partNumber === options.interruptPartNumber ? 200 : 100,
      ),
    )
    activeTransfers -= 1
    if (interruptTransfers && partNumber === options.interruptPartNumber) {
      await route.abort('connectionfailed')
      return
    }
    const completed = {
      checksumSHA256: metadata.checksumSHA256,
      etag: `etag-${partNumber}`,
      partNumber,
      size: metadata.size,
    }
    completedParts.set(partNumber, completed)
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(completed) })
  })
  await page.route(/\/controlled-upload\/complete$/, async (route) => {
    const session = sessionResponse()
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        asset: { ...session.asset, durationSeconds: 60, status: 'ready' },
      }),
    })
  })

  return {
    maximumConcurrentTransfers: () => maximumConcurrentTransfers,
    partRequests,
    partSizes,
    resume: () => {
      interruptTransfers = false
    },
  }
}

test.describe('Media Asset tracer bullet', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
    await seedUploaders()
  })

  test.afterEach(async () => {
    await cleanupMembers()
  })

  test('issue 162: shows the same workspace across Media Asset lifecycle states', async ({
    page,
  }) => {
    const readyID = await seedWorkspaceAsset('ready', 'ready-lesson.mp4', 2_500_000)
    const processingID = await seedWorkspaceAsset('processing', 'processing-lesson.mp4', 3_000_000)
    const failedID = await seedWorkspaceAsset('failed', 'failed-lesson.mp4', 4_000_000)
    await signIn(page, testInvitee)

    await page.goto(`/demo/assets/${readyID}`)
    await expect(page.getByRole('heading', { name: 'ready-lesson.mp4', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Video', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(
      page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Videos' }),
    ).toHaveAttribute('href', '/demo/videos')
    await expect(page.getByRole('button', { name: 'Start secure playback' })).toBeVisible()
    const details = page.getByRole('region', { name: 'Media Asset details' })
    await expect(details).toContainText(readyID)
    await expect(details).toContainText('Updated')
    await expect(details).toContainText('Original filename')
    const information = page.getByRole('region', { name: 'Video Information' })
    await expect(information).toContainText('360p Mobile')
    await expect(information).toContainText('720p HD')
    await expect(information).toContainText('2.38 MB')
    for (const section of [
      'Advanced Settings',
      'Thumbnail Management',
      'Video Analytics',
      'Organisation and Folder',
      'Danger Zone',
    ]) {
      await expect(page.getByRole('region', { name: section })).toBeVisible()
    }
    for (const name of [
      'Copy Media Asset ID',
      'Copy Embed Code',
      'Download Original',
      'Replace Video',
      'Upload custom poster',
      'Move Media Asset',
      'Remove tag',
    ]) {
      await expect(page.getByRole('button', { name })).toBeDisabled()
    }
    await expect(page.getByLabel('Allowed web domains')).toBeDisabled()
    const analytics = page.getByRole('region', { name: 'Video Analytics' })
    await expect(analytics).toContainText('48,290')
    await expect(analytics).toContainText('34,120 hrs')
    await expect(analytics).toContainText('1.84 TB')
    await expect(analytics).toContainText('41m 18s')
    const readyAnalytics = await analytics.innerText()

    for (const width of [1440, 1200, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 844 })
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
        )
        .toBe(true)
      if (width === 390) {
        await page.reload()
        const sectionOrder = [
          'Secure playback',
          'Video Information',
          'Advanced Settings',
          'Thumbnail Management',
          'Video Analytics',
          'Organisation and Folder',
          'Danger Zone',
        ]
        const headings = (await page.getByRole('heading').allTextContents())
          .map((heading) => heading.trim())
          .filter((heading) => sectionOrder.includes(heading))
        expect(headings).toEqual(sectionOrder)
      }
    }

    await page.goto(`/demo/assets/${processingID}`)
    await expect(page.getByRole('region', { name: 'Playback status' })).toContainText(
      'Preparing playback',
    )
    await expect(
      page.getByRole('heading', { name: 'processing-lesson.mp4', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start secure playback' })).toHaveCount(0)
    await expect
      .poll(() => page.getByRole('region', { name: 'Video Analytics' }).innerText())
      .toBe(readyAnalytics)

    await page.goto(`/demo/assets/${failedID}`)
    await expect(page.getByRole('heading', { name: 'Processing failed' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry processing' })).toBeVisible()
    await expect
      .poll(() => page.getByRole('region', { name: 'Video Analytics' }).innerText())
      .toBe(readyAnalytics)
  })

  test('opens the upload dialog before choosing a file', async ({ page }) => {
    await signIn(page, testInvitee)

    await page.getByRole('button', { name: 'Upload Video' }).click()
    await expect(page.getByRole('dialog', { name: 'Upload Video' })).toBeVisible()
    const picker = page.waitForEvent('filechooser')
    await page.locator('.upload-dropzone').click()
    await picker
  })

  test('uploads a valid fixture to ready while keeping it private to its uploader', async ({
    page,
  }) => {
    await signIn(page, testInvitee)
    await expect(page.getByText('Your library is empty.')).toBeVisible()

    await uploadVideo(page, {
      buffer: mp4Fixture(),
      mimeType: 'video/mp4',
      name: 'private-lesson.mp4',
    })

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
    await expect(page.getByRole('link', { name: 'Video', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(breadcrumb.getByRole('link', { name: 'Videos' })).toHaveAttribute(
      'href',
      '/demo/videos',
    )
    const details = page.getByRole('region', { name: 'Media Asset details' })
    await expect(details.getByText('Status', { exact: true })).toBeVisible({ timeout: 45_000 })
    await expect(details.getByText('Media Asset ID', { exact: true })).toBeVisible()
    await expect(details.getByText('Uploaded', { exact: true })).toBeVisible()
    await expect(details.getByText('Original filename', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start secure playback' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Video Information' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Advanced Settings' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Thumbnail Management' })).toBeVisible()
    const analytics = page.getByRole('region', { name: 'Video Analytics' })
    await expect(analytics).toContainText('48,290')
    await expect(analytics).toContainText('34,120 hrs')
    await expect(analytics).toContainText('1.84 TB')
    await expect(analytics).toContainText('41m 18s')
    await expect(page.getByRole('region', { name: 'Organisation and Folder' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Danger Zone' })).toBeVisible()

    for (const name of [
      'Copy Media Asset ID',
      'Copy Embed Code',
      'Download Original',
      'Replace Video',
      'Upload custom poster',
      'Move Media Asset',
    ]) {
      await expect(page.getByRole('button', { name })).toBeDisabled()
    }
    await expect(page.getByLabel('Allowed web domains')).toBeDisabled()
    await expect(page.getByText('Upload Session ID', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Processing Job ID', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Provider Job ID', { exact: true })).toHaveCount(0)
    const assetID = page.url().split('/').at(-1)
    expect(assetID).toMatch(/^asset_/)

    await page.setViewportSize({ height: 844, width: 390 })
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true)

    await page.getByRole('button', { name: 'Sign out' }).click()
    await signIn(page, testSecondUploader)
    await expect(page.getByText('Your library is empty.')).toBeVisible()

    const denied = await page.request.get(`/api/demo/assets/${assetID}`, {
      headers: { Origin: new URL(page.url()).origin },
    })
    expect(denied.status()).toBe(404)
  })

  test('issue 109: lets a publisher browse, organize, filter, and open Media Assets', async ({
    page,
  }) => {
    await signIn(page, testInvitee)
    await expect(page.getByRole('button', { name: 'Import' })).toBeDisabled()
    await page.getByRole('button', { name: 'Create Folder' }).click()
    await page.getByLabel('Folder name').fill('Course library')
    await page.getByRole('button', { name: 'Save Folder' }).click()
    await expect(page.getByRole('button', { name: 'Course library' })).toBeVisible()

    await uploadVideo(page, {
      buffer: mp4Fixture(),
      mimeType: 'video/mp4',
      name: 'library-workflow.mp4',
    })

    const asset = page.getByRole('article', { name: 'library-workflow.mp4' })
    await expect(asset.getByText('ready', { exact: true })).toBeVisible({ timeout: 45_000 })
    await expect(asset.getByText(/Uploaded /)).toBeVisible()
    await expect(asset.getByText(/Duration 0:01/)).toBeVisible()
    await expect(asset.getByAltText('Thumbnail for library-workflow.mp4')).toHaveAttribute(
      'src',
      /\/thumbnail$/,
    )
    await expect(asset.getByLabel('Folder for library-workflow.mp4')).toHaveValue(/\d+/)

    await page.getByRole('button', { name: 'All Videos' }).click()
    await asset.getByLabel('Folder for library-workflow.mp4').selectOption({ label: 'All Videos' })
    await page.getByRole('button', { name: 'Course library' }).click()
    await expect(asset).toHaveCount(0)
    await page.getByRole('button', { name: 'All Videos' }).click()
    await asset
      .getByLabel('Folder for library-workflow.mp4')
      .selectOption({ label: 'Course library' })
    await page.getByRole('button', { name: 'Course library' }).click()
    await expect(asset).toBeVisible()

    await page.getByRole('button', { name: 'Grid view' }).click()
    await expect(page.getByRole('region', { name: 'Media Asset results' })).toHaveAttribute(
      'data-view',
      'grid',
    )
    await page.getByLabel('Search Media Assets').fill('no-match')
    await expect(page.getByText('No Media Assets match these filters.')).toBeVisible()
    await page.getByLabel('Search Media Assets').fill('library-workflow')
    await page.getByLabel('Status').selectOption('ready')
    await page.getByLabel('Upload date').selectOption('7')
    await expect(asset).toBeVisible()
    await page.getByRole('button', { name: 'List view' }).click()
    await expect(page.getByRole('region', { name: 'Media Asset results' })).toHaveAttribute(
      'data-view',
      'list',
    )

    await asset.getByRole('link', { name: 'Open library-workflow.mp4' }).click()
    await expect(page).toHaveURL(/\/demo\/assets\/asset_/, { timeout: 45_000 })
  })

  test('issue 40: rejects a hostile browser origin without CORS access', async ({ page }) => {
    await signIn(page, testInvitee)

    const missingBrowserHeaders = await page.request.get('/api/demo/assets')
    expect(missingBrowserHeaders.status()).toBe(401)
    const sameOrigin = await page.request.get('/api/demo/assets', {
      headers: { Origin: new URL(page.url()).origin },
    })
    expect(sameOrigin.status()).toBe(200)

    const response = await page.request.post('/api/demo/uploads', {
      data: {
        fileFingerprint: 'hostile-origin',
        fileName: 'hostile-origin.mp4',
        mimeType: 'video/mp4',
        size: 128,
      },
      headers: { origin: 'https://attacker.example' },
    })

    expect(response.status()).toBe(403)
    expect(response.headers()['access-control-allow-origin']).toBeUndefined()
  })

  test('issue 38: deletes an owned Media Asset and removes it from the library immediately', async ({
    page,
  }) => {
    await signIn(page, testInvitee)
    await uploadVideo(page, {
      buffer: mp4Fixture(),
      mimeType: 'video/mp4',
      name: 'delete-me.mp4',
    })
    const asset = page.getByRole('article', { name: 'delete-me.mp4' })
    await expect(asset.getByText('ready', { exact: true })).toBeVisible({ timeout: 45_000 })
    await asset.getByRole('link', { name: 'Inspect asset' }).click()

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Delete asset' }).click()

    await expect(page).toHaveURL('/demo')
    await expect(page.getByText('Your library is empty.')).toBeVisible()
  })

  test('issue 86: opens the Media Library without processing queued Media Assets', async ({
    page,
  }) => {
    await signIn(page, testInvitee)
    await uploadVideo(page, {
      buffer: mp4Fixture(),
      mimeType: 'video/mp4',
      name: 'expired-lesson.mp4',
    })
    const asset = page.getByRole('article', { name: 'expired-lesson.mp4' })
    await expect(asset.getByText('ready', { exact: true })).toBeVisible({ timeout: 45_000 })
    const detailURL = await asset.getByRole('link', { name: 'Inspect asset' }).getAttribute('href')
    const mediaAssetId = detailURL!.split('/').at(-1)!
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
        attempts: 0,
        dispatchedAt: null,
        nextAttemptAt: new Date(Date.now() - 1).toISOString(),
        providerJobId: null,
        status: 'queued',
      },
      overrideAccess: true,
      where: { asset: { equals: assets.docs[0]!.id } },
    })
    await payload.update({
      collection: 'media-assets',
      data: {
        expiresAt: new Date(Date.now() - 1).toISOString(),
        status: 'ready',
        statusChangedAt: new Date().toISOString(),
      },
      overrideAccess: true,
      where: { mediaAssetId: { equals: mediaAssetId } },
    })

    await page.reload()
    await expect(asset.getByText('ready', { exact: true })).toBeVisible()
    await expect(
      payload.find({
        collection: 'media-assets',
        limit: 1,
        overrideAccess: true,
        where: { mediaAssetId: { equals: mediaAssetId } },
      }),
    ).resolves.toMatchObject({ docs: [{ status: 'ready' }] })
    await expect(
      payload.find({
        collection: 'processing-jobs',
        limit: 1,
        overrideAccess: true,
        where: { asset: { equals: assets.docs[0]!.id } },
      }),
    ).resolves.toMatchObject({ docs: [{ status: 'queued' }] })
  })

  test('issue 38: keeps an expired Media Asset visible while blocking new playback', async ({
    page,
  }) => {
    await signIn(page, testInvitee)
    await uploadVideo(page, {
      buffer: mp4Fixture(),
      mimeType: 'video/mp4',
      name: 'expired-lesson.mp4',
    })
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

    await payload.jobs.queue({ input: {}, queue: 'media-processing', task: 'process-media-jobs' })
    await payload.jobs.run({ limit: 1, queue: 'media-processing' })
    await page.reload()
    await expect(asset.getByText('expired', { exact: true })).toBeVisible({ timeout: 45_000 })
    await asset.getByRole('link', { name: 'Inspect asset' }).click()
    await expect(page.getByRole('heading', { name: 'Secure playback' })).toHaveCount(0)
    const grant = await page.request.post(`/api/demo/assets/${mediaAssetId}/playback-grants`, {
      headers: { Origin: new URL(page.url()).origin },
    })
    expect(grant.status()).toBe(409)
  })

  test('issue 38: lets a Platform Administrator inspect and delete another Organisation’s Media Asset', async ({
    page,
  }) => {
    await signIn(page, testInvitee)
    await uploadVideo(page, {
      buffer: mp4Fixture(),
      mimeType: 'video/mp4',
      name: 'operator-delete.mp4',
    })
    const asset = page.getByRole('article', { name: 'operator-delete.mp4' })
    await expect(asset.getByText('ready', { exact: true })).toBeVisible({ timeout: 45_000 })
    const payload = await getPayload({ config })
    const platformAdministrator = await payload.create({
      collection: 'members',
      data: {
        ...testOperator,
        status: 'active',
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'platform-administrators',
      data: { member: platformAdministrator.id, status: 'active' },
      overrideAccess: true,
    })
    await page.getByRole('button', { name: 'Sign out' }).click()
    await signIn(page, testOperator)

    await expect(page.getByLabel('Video file')).toHaveCount(0)
    const administratorAsset = page.getByRole('article', { name: 'operator-delete.mp4' })
    await administratorAsset.getByRole('link', { name: 'Inspect asset' }).click()
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
    await uploadVideo(page, {
      buffer: mp4Fixture(60, 16 * 1024 * 1024 + 1),
      mimeType: 'video/mp4',
      name: 'retry-lesson.mp4',
    })

    await expect(
      page.getByRole('article', { name: 'retry-lesson.mp4' }).getByText('ready'),
    ).toBeVisible()
    expect(partRequests.get('1')).toBe(1)
    expect(partRequests.get('2')).toBe(2)
  })

  test('limits direct multipart transfers to three concurrent parts', async ({ page }) => {
    const partSize = 1024
    const upload = await controlMultipartUpload(page, { partSize })

    await signIn(page, testInvitee)
    await uploadVideo(page, {
      buffer: mp4Fixture(60, partSize * 128),
      mimeType: 'video/mp4',
      name: 'parallel-lesson.mp4',
    })

    await expect(
      page.getByRole('article', { name: 'parallel-lesson.mp4' }).getByText('ready'),
    ).toBeVisible({ timeout: 45_000 })
    expect(upload.maximumConcurrentTransfers()).toBe(3)
    const orderedPartSizes = [...upload.partSizes.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, size]) => size)
    expect(orderedPartSizes).toHaveLength(128)
    expect(orderedPartSizes.every((size) => size === partSize)).toBe(true)
  })

  test('resumes completed parts after reload when the same file is reselected', async ({
    page,
  }) => {
    const partSize = 16 * 1024 * 1024
    const upload = await controlMultipartUpload(page, { interruptPartNumber: 2, partSize })

    const file = {
      buffer: mp4Fixture(60, partSize * 2 + 1),
      mimeType: 'video/mp4',
      name: 'resume-lesson.mp4',
    }
    await signIn(page, testInvitee)
    await uploadVideo(page, file)
    await expect(page.locator('.form-message[role="alert"]')).toContainText(
      'Reselect this file to resume',
      { timeout: 45_000 },
    )
    expect(upload.partRequests.get(1)).toBe(1)
    expect(upload.partRequests.get(3)).toBe(1)

    upload.resume()
    await page.reload()
    await uploadVideo(page, file)

    await expect(
      page.getByRole('article', { name: 'resume-lesson.mp4' }).getByText('ready'),
    ).toBeVisible({ timeout: 45_000 })
    expect(upload.partRequests.get(1)).toBe(1)
    expect(upload.partRequests.get(3)).toBe(1)
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

    const original = mp4Fixture(60, 16 * 1024 * 1024 + 1)
    const changed = Buffer.from(original)
    changed[1024 * 1024] = 1
    const file = { buffer: original, mimeType: 'video/mp4', name: 'changed-lesson.mp4' }
    await signIn(page, testInvitee)
    await uploadVideo(page, file)
    await expect(page.locator('.form-message[role="alert"]')).toContainText(
      'Reselect this file to resume',
    )

    interruptSecondPart = false
    await page.reload()
    await uploadVideo(page, { ...file, buffer: changed })
    await expect(page.locator('.form-message[role="alert"]')).toContainText(
      'does not match the completed upload parts',
    )
  })

  test('shows a sanitized failure and lets the uploader retry while the source exists', async ({
    page,
  }) => {
    await signIn(page, testInvitee)
    await uploadVideo(page, {
      buffer: mp4Fixture(),
      mimeType: 'video/mp4',
      name: 'retryable-lesson.mp4',
    })
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
