import { expect, test } from '@playwright/test'

import {
  cleanupPilotMembers,
  seedPilotOperator,
  testInvitee,
  testOperator,
} from '../helpers/seedPilotMembers'

test.describe('Pilot Member access', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
    await seedPilotOperator()
  })

  test.afterEach(async () => {
    await cleanupPilotMembers()
  })

  test('returns a logged-out visitor to the requested Demo route after sign-in', async ({
    page,
  }) => {
    await page.goto('/demo')

    await expect(page).toHaveURL('/demo/sign-in?returnTo=%2Fdemo')
    await expect(page.getByRole('heading', { name: 'Sign in to the Demo' })).toBeVisible()
  })

  test('an operator invites an uploader who sets a password and enters the protected Demo', async ({
    page,
  }) => {
    await page.goto('/demo/sign-in?returnTo=%2Fdemo%2Fmembers')
    await page.getByLabel('Email').fill(testOperator.email)
    await page.getByLabel('Password').fill(testOperator.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL('/demo/members', { timeout: 60_000 })
    await page.getByLabel('Name').fill(testInvitee.name)
    await page.getByLabel('Email').fill(testInvitee.email)
    await page.getByRole('button', { name: 'Create setup link' }).click()

    const setupLink = page.getByTestId('setup-link')
    await expect(setupLink).toBeVisible({ timeout: 60_000 })
    const setupURL = await setupLink.getAttribute('href')
    expect(setupURL).toBeTruthy()

    await page.goto(setupURL!)
    await page.getByLabel('Password').fill(testInvitee.password)
    await page.getByRole('button', { name: 'Set password' }).click()
    await expect(page.getByText('Password set. You can sign in now.')).toBeVisible({
      timeout: 60_000,
    })

    await page.getByLabel('Email').fill(testInvitee.email)
    await page.getByLabel('Password').fill(testInvitee.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/demo', { timeout: 60_000 })
    await expect(page.getByText(`Signed in as ${testInvitee.name}`)).toBeVisible()

    await page.goto('/admin')
    await expect(page).toHaveURL('/admin/unauthorized')
  })

  test('a Pilot Member can sign out and is denied the protected Demo afterward', async ({
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
