import type { Page } from '@playwright/test'

/**
 * Seeds the stored theme preference before the page's inline script reads it,
 * which is the only point at which the theme is decided.
 */
export async function storeThemePreference(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem('payload-theme', value)
  }, theme)
}
