import { expect, test } from '@playwright/test'

import { cleanupMembers, seedOperator, testOperator } from '../helpers/seedMembers'

test.describe('Member access', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
    await seedOperator()
  })

  test.afterEach(async () => {
    await cleanupMembers()
  })

  test('returns a logged-out visitor to the requested Demo route after sign-in', async ({
    page,
  }) => {
    await page.goto('/demo')

    await expect(page).toHaveURL('/demo/sign-in?returnTo=%2Fdemo')
    await expect(page.getByRole('heading', { name: 'Sign in to the Demo' })).toBeVisible()
  })

  test('an authenticated Member can enter the protected workspace but cannot administer the CMS', async ({
    page,
  }) => {
    await page.goto('/demo/sign-in?returnTo=%2Fdemo')
    await page.getByLabel('Email').fill(testOperator.email)
    await page.getByLabel('Password').fill(testOperator.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL('/demo', { timeout: 60_000 })
    await expect(page.getByText(`Signed in as ${testOperator.name}`)).toBeVisible()

    const cmsWrite = await page.request.post('/api/pages', {
      data: { slug: 'member-must-not-create-this', title: 'Forbidden CMS write' },
    })
    expect(cmsWrite.status()).toBe(403)

    const cmsUsers = await page.request.get('/api/users')
    expect(cmsUsers.status()).toBe(403)

    await page.goto('/admin')
    await expect(page).toHaveURL('/admin/unauthorized')
  })

  test('a Member can sign out and is denied the protected Demo afterward', async ({
    page,
  }) => {
    await page.goto('/demo/sign-in')
    await page.getByLabel('Email').fill(testOperator.email)
    await page.getByLabel('Password').fill(testOperator.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/demo')

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByText('You have signed out.')).toBeVisible()
    await page.goto('/demo')
    await expect(page).toHaveURL('/demo/sign-in?returnTo=%2Fdemo')
  })
})
