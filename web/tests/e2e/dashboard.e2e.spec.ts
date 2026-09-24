import { expect, test } from '@playwright/test'
import { getPayload } from 'payload'

import config from '../../src/payload.config.js'
import {
  cleanupMembers,
  seedOperator,
  seedUploaders,
  testInvitee,
  testOperator,
} from '../helpers/seedMembers'

async function signIn(
  page: import('@playwright/test').Page,
  member: { email: string; password: string } = testInvitee,
) {
  await page.goto('/demo/sign-in')
  await page.getByLabel('Email').fill(member.email)
  await page.getByLabel('Password').fill(member.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/demo', { timeout: 60_000 })
}

test.describe('Dashboard shell', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
    await seedUploaders()
  })

  test.afterEach(async () => {
    await cleanupMembers()
  })

  test('keeps authenticated navigation, actions, and deferred areas clear', async ({ page }) => {
    await signIn(page)

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText('Welcome back, Organisation Publisher')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Invite User' })).toHaveCount(0)
    await expect(page.getByText('API key', { exact: false })).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'Static usage overview chart' })).toBeVisible()
    for (const metric of [
      'Storage Usage',
      'Bandwidth Consumption',
      'Video Processing',
      'CDN Performance',
    ]) {
      await expect(page.getByText(metric, { exact: true })).toBeVisible()
    }

    for (const label of [
      'Dashboard',
      'Video',
      'Live',
      'Storage',
      'CDN',
      'Account',
      'Integrations',
      'Support',
    ]) {
      await expect(
        page
          .getByRole('navigation', { name: 'Dashboard navigation' })
          .getByRole('link', { name: label }),
      ).toBeVisible()
    }

    const fileChooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Upload Video' }).click({ timeout: 1_000 })
    await (
      await fileChooser
    ).setFiles({
      buffer: Buffer.from('video'),
      mimeType: 'video/mp4',
      name: 'selected-from-dashboard.mp4',
    })
    await expect(page.getByLabel('Video file')).toHaveValue(/selected-from-dashboard\.mp4/)

    for (const { label, title } of [
      { label: 'Live', title: 'Live video is coming soon' },
      { label: 'Storage', title: 'Storage management is coming soon' },
      { label: 'CDN', title: 'CDN controls are coming soon' },
      { label: 'Account', title: 'Account controls are coming soon' },
      { label: 'Integrations', title: 'Integrations are coming soon' },
      { label: 'Support', title: 'Support is coming soon' },
    ]) {
      await page.getByRole('link', { name: label, exact: true }).click()
      await expect(page).toHaveURL(`/demo/${label.toLowerCase()}`)
      await expect(page.getByRole('heading', { name: title })).toBeVisible()
      await expect(page.getByText('Coming soon', { exact: true })).toBeVisible()
      await expect(page.getByText(/delivery quarter/i)).toHaveCount(0)
    }
    await expect(page.getByText(/up to 50% on Amazon S3 storage/i)).toHaveCount(0)

    await page.getByRole('link', { name: 'Storage', exact: true }).click()
    await expect(page.getByText(/up to 50% on Amazon S3 storage/i)).toBeVisible()
  })

  test('compacts navigation behind an accessible mobile menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page)

    const navigation = page.getByRole('navigation', { name: 'Dashboard navigation' })
    await expect(navigation).toBeHidden()
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await expect(navigation).toBeVisible()
    await page.getByRole('button', { name: 'Close navigation' }).click()
    await expect(navigation).toBeHidden()
  })

  test('removes the entire desktop navigation rail when it is closed', async ({ page }) => {
    await signIn(page)
    const navigation = page.getByRole('navigation', { name: 'Dashboard navigation' })
    await expect(navigation).toBeVisible()
    await page.getByRole('button', { name: 'Close navigation' }).click()
    await expect(navigation).toBeHidden()
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible()
  })

  test('shows Invite User only to an Organisation Administrator', async ({ page }) => {
    const payload = await getPayload({ config })
    const memberships = await payload.find({
      collection: 'organisation-memberships',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { role: { equals: 'publisher' } },
    })
    await payload.update({
      collection: 'organisation-memberships',
      data: { role: 'administrator' },
      id: memberships.docs[0]!.id,
      overrideAccess: true,
    })

    await signIn(page)
    await page.getByRole('link', { name: 'Invite User' }).click()
    await expect(page).toHaveURL(/\/demo\/organisations\/\d+\/members/)
    await expect(page.getByRole('heading', { name: 'Organisation Memberships' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Dashboard navigation' })).toBeVisible()
  })
})

test.describe('Platform organisation administration', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
    await seedOperator()
  })
  test.afterEach(async () => {
    await cleanupMembers()
  })
  test('lets a Platform Administrator create an Organisation through the Dashboard', async ({
    page,
  }) => {
    await signIn(page, testOperator)
    await page.getByRole('link', { name: 'Manage Organisations' }).click()
    await expect(page.getByRole('heading', { name: 'Organisation administration' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Grant Platform Administrator access' }),
    ).toBeVisible()
    await page.getByLabel('Organisation name').fill('Academy Library')
    await page.getByLabel('Initial Organisation Administrator').selectOption({
      label: testOperator.name,
    })
    await page.getByRole('button', { name: 'Create Organisation' }).click()
    await expect(page.getByText('Academy Library was created.')).toBeVisible()
    await expect(
      page.getByRole('list', { name: 'Active Organisations' }).getByText('Academy Library'),
    ).toBeVisible()
  })
})
