import { expect, test, type Page } from '@playwright/test'

import {
  brandArticleFixture,
  cleanupBrandArticle,
  seedBrandArticle,
} from '../helpers/seedBrandArticle'
import { storeThemePreference } from '../helpers/theme'

const HOME = 'http://localhost:3000'

declare global {
  interface Window {
    __themeWhenBodyAppeared: string | null
  }
}

/**
 * Records the resolved theme at the instant the body is inserted into the
 * document. If theme resolution had been deferred to React, the attribute
 * would still be missing at that point and the reader would see a flash.
 */
async function recordThemeWhenBodyAppears(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__themeWhenBodyAppeared = null

    new MutationObserver((records, observer) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if ((node as Element).tagName === 'BODY') {
            window.__themeWhenBodyAppeared = document.documentElement.getAttribute('data-theme')
            observer.disconnect()
          }
        }
      }
    }).observe(document, { childList: true, subtree: true })
  })
}

/**
 * The resolved font stack for a selector, with next/font's generated family
 * names stripped so the assertion reads against the real typeface names.
 */
async function fontFamilyOf(page: Page, selector: string): Promise<string> {
  return page.evaluate((target) => {
    const element = document.querySelector(target)

    return element ? getComputedStyle(element).fontFamily : ''
  }, selector)
}

/**
 * The gradient painted over the foot of the Article hero. A hard-coded black
 * scrim would swallow the heading in the light theme, so it has to resolve to
 * whichever ground the reader is on.
 */
async function heroScrimGradient(page: Page): Promise<string> {
  return page.evaluate(() => {
    const scrim = document.querySelector('[data-hero-scrim]')

    return scrim ? getComputedStyle(scrim).backgroundImage : ''
  })
}

/**
 * Contrast ratio between the Article's body copy and the ground it sits on,
 * per the WCAG relative-luminance formula.
 */
async function bodyCopyContrast(page: Page): Promise<number> {
  return page.evaluate((text) => {
    const paragraph = Array.from(document.querySelectorAll('p')).find((node) =>
      node.textContent?.includes(text),
    )

    const channel = (value: number) => {
      const scaled = value / 255

      return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4)
    }

    const luminance = (colour: string) => {
      const [red, green, blue] = colour.match(/\d+(\.\d+)?/g)!.map(Number)

      return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
    }

    const foreground = luminance(getComputedStyle(paragraph!).color)
    const background = luminance(getComputedStyle(document.body).backgroundColor)
    const [lighter, darker] = [foreground, background].sort((a, b) => b - a)

    return (lighter + 0.05) / (darker + 0.05)
  }, brandArticleFixture.paragraphText)
}

test.describe('Brand foundation', () => {
  test.describe('theme resolution', () => {
    test('a visitor with no stored preference gets the dark ground, even when their OS asks for light', async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: 'light' })
      await page.goto(HOME)

      // Guards the test itself: if the browser were not reporting a light OS
      // preference, this would pass without proving anything.
      expect(
        await page.evaluate(() => window.matchMedia('(prefers-color-scheme: light)').matches),
      ).toBe(true)
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(8, 8, 11)')
    })

    test('a stored preference still wins over the dark default', async ({ page }) => {
      await storeThemePreference(page, 'light')
      await page.goto(HOME)

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(251, 251, 253)')
    })

    test('choosing a theme changes the ground and the choice survives a reload', async ({
      page,
    }) => {
      await page.goto(HOME)
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(8, 8, 11)')

      await page.getByRole('combobox', { name: 'Select a theme' }).click()
      await page.getByRole('option', { name: 'Light' }).click()

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(251, 251, 253)')

      await page.reload()

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(251, 251, 253)')
    })

    test('the theme choices offered are only the two that exist', async ({ page }) => {
      await page.goto(HOME)

      await page.getByRole('combobox', { name: 'Select a theme' }).click()

      await expect(page.getByRole('option')).toHaveText(['Dark', 'Light'])
    })

    test('the theme is resolved before the document body is parsed, so nothing flashes', async ({
      page,
    }) => {
      await recordThemeWhenBodyAppears(page)
      await page.goto(HOME)

      await expect
        .poll(() => page.evaluate(() => window.__themeWhenBodyAppeared))
        .toBe('dark')
    })
  })

  test.describe('typefaces', () => {
    test('headings are set in Manrope and body copy in IBM Plex Sans, each with a fallback stack', async ({
      page,
    }) => {
      await page.goto(HOME)

      const headingStack = await fontFamilyOf(page, 'h1')
      expect(headingStack).toContain('Manrope')
      expect(headingStack).toMatch(/system-ui|sans-serif/)

      const bodyStack = await fontFamilyOf(page, 'body')
      expect(bodyStack).toContain('IBM Plex Sans')
      expect(bodyStack).toMatch(/system-ui|sans-serif/)
    })

    test('no render-blocking external font stylesheet is requested', async ({ page }) => {
      const externalStylesheets: string[] = []

      page.on('request', (request) => {
        if (request.resourceType() === 'stylesheet' && !request.url().startsWith(HOME)) {
          externalStylesheets.push(request.url())
        }
      })

      await page.goto(HOME)

      expect(externalStylesheets).toEqual([])
    })
  })

  test.describe('an Article on the brand', () => {
    const ARTICLE = `${HOME}/articles/${brandArticleFixture.slug}`

    test.beforeAll(async () => {
      await seedBrandArticle()
    })

    test.afterAll(async () => {
      await cleanupBrandArticle()
    })

    test('links inside prose take Signal Deep in the light theme', async ({ page }) => {
      await storeThemePreference(page, 'light')
      await page.goto(ARTICLE)

      const link = page.getByRole('link', { name: brandArticleFixture.linkText })

      await expect(link).toHaveCSS('color', 'rgb(138, 110, 5)')
    })

    test('headings and body copy carry the brand colours in both themes', async ({ page }) => {
      await page.goto(ARTICLE)

      const heading = page.getByRole('heading', { name: brandArticleFixture.headingText })
      await expect(heading).toHaveCSS('color', 'rgb(255, 255, 255)')
      expect(await fontFamilyOf(page, 'article h2')).toContain('Manrope')

      const paragraph = page.getByText(brandArticleFixture.paragraphText)
      await expect(paragraph).toHaveCSS('color', 'rgb(140, 140, 154)')

      await storeThemePreference(page, 'light')
      await page.reload()

      await expect(heading).toHaveCSS('color', 'rgb(8, 8, 11)')
      await expect(paragraph).toHaveCSS('color', 'rgb(60, 60, 70)')
    })

    test('the hero fades into the page ground rather than into black', async ({ page }) => {
      await page.goto(ARTICLE)
      expect(await heroScrimGradient(page)).toContain('rgb(8, 8, 11)')

      await storeThemePreference(page, 'light')
      await page.reload()
      expect(await heroScrimGradient(page)).toContain('rgb(251, 251, 253)')
    })

    test('body copy meets the contrast requirement in both themes', async ({ page }) => {
      await page.goto(ARTICLE)
      expect(await bodyCopyContrast(page)).toBeGreaterThanOrEqual(4.5)

      await storeThemePreference(page, 'light')
      await page.reload()
      expect(await bodyCopyContrast(page)).toBeGreaterThanOrEqual(4.5)
    })

    test('links inside prose take Signal Yellow in the dark theme', async ({ page }) => {
      await page.goto(ARTICLE)

      const link = page.getByRole('link', { name: brandArticleFixture.linkText })

      await expect(link).toHaveCSS('color', 'rgb(243, 195, 12)')
    })
  })

  test.describe('surfaces', () => {
    test('a primary action is a yellow pill with Ink text, not white text', async ({ page }) => {
      await page.goto(`${HOME}/no-such-page`)

      const primary = page.getByRole('link', { name: 'Go home' })

      await expect(primary).toHaveCSS('background-color', 'rgb(243, 195, 12)')
      await expect(primary).toHaveCSS('color', 'rgb(8, 8, 11)')
      await expect(primary).toHaveCSS('border-radius', '999px')
    })

    test('depth comes from value and hairlines, never from a shadow', async ({ page }) => {
      await page.goto(`${HOME}/no-such-page`)

      const primary = page.getByRole('link', { name: 'Go home' })

      await expect(primary).toHaveCSS('box-shadow', 'none')
    })

    test('every radius on the page is one of the three the brand allows', async ({ page }) => {
      await page.goto(HOME)

      const radii = await page.evaluate(() => {
        const permitted = new Set(['0px', '16px', '20px', '999px', '50%'])
        const offenders = new Set<string>()

        for (const element of Array.from(document.querySelectorAll('body *'))) {
          const style = getComputedStyle(element)

          for (const corner of [
            style.borderTopLeftRadius,
            style.borderTopRightRadius,
            style.borderBottomLeftRadius,
            style.borderBottomRightRadius,
          ]) {
            if (!permitted.has(corner)) offenders.add(corner)
          }
        }

        return Array.from(offenders)
      })

      expect(radii).toEqual([])
    })
  })

  test.describe('motion', () => {
    test('a reader who asks for reduced motion gets no transitions or animations', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(`${HOME}/no-such-page`)

      const primary = page.getByRole('link', { name: 'Go home' })

      await expect(primary).toHaveCSS('transition-duration', '0s')
      await expect(primary).toHaveCSS('animation-duration', '0s')
    })
  })
})
