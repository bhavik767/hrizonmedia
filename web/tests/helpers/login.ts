import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export interface LoginOptions {
  page: Page
  serverURL?: string
  user: {
    email: string
    password: string
  }
}

/**
 * Logs the user into the admin panel via the login page.
 */
export async function login({
  page,
  serverURL = 'http://localhost:3000',
  user,
}: LoginOptions): Promise<void> {
  await page.goto(`${serverURL}/admin/login`)

  await page.fill('#field-email', user.email)
  await page.fill('#field-password', user.password)
  await page.click('button[type="submit"]')

  await page.waitForURL(`${serverURL}/admin`)

  /*
   * Confirm the session actually took, by the one control that only an
   * authenticated visitor is given: a way out. Someone who is not logged in is
   * bounced back to the login screen and is never offered a log out link.
   *
   * This deliberately asserts on a role and a visible name rather than a
   * Payload-internal class. The previous check waited for `.step-nav__first`,
   * which the admin panel stopped rendering, so every login silently timed out
   * and took the whole suite with it. A landmark a reader would recognise
   * survives the next admin release; a private class name does not.
   */
  await expect(page.getByRole('link', { name: 'Log out' })).toBeVisible()
}
