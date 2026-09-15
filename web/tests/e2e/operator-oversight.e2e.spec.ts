import { expect, test } from '@playwright/test'
import { getPayload } from 'payload'

import config from '../../src/payload.config.js'
import {
  cleanupPilotMembers,
  seedPilotOperator,
  testInvitee,
  testOperator,
} from '../helpers/seedPilotMembers.js'

test.describe('operator oversight', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
    await seedPilotOperator()
    const payload = await getPayload({ config })
    const uploader = await payload.create({
      collection: 'pilot-members',
      data: {
        ...testInvitee,
        invitationAcceptedAt: new Date().toISOString(),
        role: 'uploader',
        status: 'active',
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'media-assets',
      data: {
        fileName: 'operator-case.mp4',
        mediaAssetId: 'asset_00000000-0000-4000-8000-000000000039',
        mimeType: 'video/mp4',
        owner: uploader.id,
        size: 2048,
        status: 'failed',
        statusChangedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })
  })

  test.afterEach(cleanupPilotMembers)

  test('an operator inspects the pilot and changes safe operating controls', async ({ page }) => {
    await page.goto('/demo/sign-in')
    await page.getByLabel('Email').fill(testOperator.email)
    await page.getByLabel('Password').fill(testOperator.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('link', { name: 'Operator oversight' }).click()

    await expect(page).toHaveURL('/demo/operations', { timeout: 60_000 })
    await expect(page.getByRole('heading', { name: 'Operator oversight' })).toBeVisible()
    const members = page.getByRole('region', { name: 'Pilot Members' })
    const assets = page.getByRole('region', { name: 'All Media Assets' })
    await expect(members.getByText(testInvitee.email)).toBeVisible()
    await expect(assets.getByText('operator-case.mp4')).toBeVisible()
    const deletion = await page.request.delete(
      '/api/demo/assets/asset_00000000-0000-4000-8000-000000000039',
      { headers: { Origin: new URL(page.url()).origin } },
    )
    expect(deletion.status()).toBe(204)
    await page.reload()
    const auditEvents = page.getByRole('region', { name: 'Audit Events' })
    await expect(auditEvents.getByText('asset deleted')).toBeVisible()
    await expect(
      auditEvents
        .locator('article')
        .filter({ hasText: 'asset deleted' })
        .getByText('asset_00000000-0000-4000-8000-000000000039'),
    ).toBeVisible()
    await page.getByRole('button', { name: `Disable ${testInvitee.email}` }).click()
    await expect(members.getByText('disabled', { exact: true })).toBeVisible()

    await page.getByLabel('Provider concurrency').fill('3')
    await page.getByLabel('Pause all media activity').check()
    await page.getByRole('button', { name: 'Save operating controls' }).click()
    await expect(page.getByText('Media activity is paused.')).toBeVisible()
  })
})
