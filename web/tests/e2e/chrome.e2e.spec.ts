import { expect, test } from '@playwright/test'

import {
  categories,
  cleanupNavigationUser,
  legal,
  seedNavigation,
  writeNavigation,
} from '../helpers/seedNavigation'
import { storeThemePreference } from '../helpers/theme'

const HOME = 'http://localhost:3000'

test.describe('Chrome', () => {
  test.beforeAll(async () => {
    await seedNavigation()

    /*
     * Compile /search before any test needs it. `next dev` builds a route on
     * first request, and the search test clicks through to it — the click
     * fired, the route began compiling, and the URL was still / when the
     * assertion gave up. Paying the compile here keeps it out of the test.
     */
    await fetch(`${HOME}/search`).catch(() => {
      /* Best effort: if /search is genuinely broken, its own test says so. */
    })
  })

  test.afterAll(async () => {
    await cleanupNavigationUser()
  })

  test.describe('the header', () => {
    test('offers the three categories that exist', async ({ page }) => {
      await page.goto(HOME)

      const nav = page.getByRole('banner').getByRole('navigation')

      for (const category of categories) {
        await expect(nav.getByRole('link', { name: category.title })).toHaveAttribute(
          'href',
          category.href,
        )
      }
    })

    test('takes its links from the header global, so they change without a deploy', async ({
      page,
    }) => {
      const renamed = [{ href: '/posts?category=comparisons', title: 'Head to head' }]

      try {
        await writeNavigation({ headerNavItems: renamed })
        await page.goto(HOME)

        const nav = page.getByRole('banner').getByRole('navigation')

        await expect(nav.getByRole('link', { name: 'Head to head' })).toBeVisible()
        await expect(nav.getByRole('link', { name: 'Comparisons' })).toHaveCount(0)
      } finally {
        await writeNavigation()
      }
    })

    test('offers a way to search from any page', async ({ page }) => {
      await page.goto(HOME)

      await page.getByRole('banner').getByRole('link', { name: 'Search' }).click()

      await expect(page).toHaveURL(`${HOME}/search`)
    })

    test('holds the only theme toggle on the page', async ({ page }) => {
      await page.goto(HOME)

      const toggles = page.getByRole('combobox', { name: 'Select a theme' })

      await expect(toggles).toHaveCount(1)
      await expect(page.getByRole('banner').getByRole('combobox', { name: 'Select a theme' })).toBeVisible()
    })

    test('carries no call to action and no promotional bar', async ({ page }) => {
      await page.goto(HOME)

      // A promotional bar would sit above the header and push it down the page.
      expect((await page.getByRole('banner').boundingBox())?.y).toBe(0)

      // Signal Yellow is the fill of the site's single primary action, which
      // lives beside the Article. Nothing in the chrome may wear it.
      const yellowFills = await page.evaluate(() =>
        Array.from(document.querySelectorAll('header, header *')).filter(
          (element) => getComputedStyle(element).backgroundColor === 'rgb(243, 195, 12)',
        ).length,
      )
      expect(yellowFills).toBe(0)

      await expect(page.getByRole('banner').getByRole('link')).toHaveText([
        '',
        ...categories.map((category) => category.title),
        '',
      ])
    })

    test('leads with the EncryptStream lockup, served from this site', async ({ page }) => {
      await page.goto(HOME)

      const home = page.getByRole('banner').getByRole('link', { name: 'EncryptStream' })

      await expect(home).toHaveAttribute('href', '/')
      await expect(home.locator('img').first()).toHaveAttribute('src', /^\/|^http:\/\/localhost:3000/)
    })
  })

  test.describe('the footer', () => {
    test('repeats the categories and adds the legal links', async ({ page }) => {
      await page.goto(HOME)

      const footer = page.getByRole('contentinfo')

      await expect(footer.getByRole('link', { name: 'EncryptStream' })).toHaveAttribute('href', '/')

      for (const category of categories) {
        await expect(footer.getByRole('link', { name: category.title })).toHaveAttribute(
          'href',
          category.href,
        )
      }

      for (const item of legal) {
        await expect(footer.getByRole('link', { name: item.title })).toHaveAttribute(
          'href',
          item.href,
        )
      }
    })

    test('its legal links land on a page rather than a dead end', async ({ page }) => {
      for (const item of legal) {
        const response = await page.goto(`${HOME}${item.href}`)

        expect(response?.status(), `${item.href} should resolve`).toBe(200)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      }
    })

    test('reserves the second email capture without shipping a form that goes nowhere', async ({
      page,
    }) => {
      await page.goto(HOME)

      const footer = page.getByRole('contentinfo')

      await expect(footer.locator('[data-email-capture-slot]')).toHaveCount(1)
      await expect(footer.locator('form')).toHaveCount(0)
    })
  })

  test.describe('by keyboard', () => {
    test('tabbing reaches every link in the chrome, and each one shows where it is', async ({
      page,
    }) => {
      await page.goto(HOME)
      await page.locator('body').click({ position: { x: 1, y: 1 } })

      const categoryHrefs = categories.map((category) => category.href)
      const expected = [
        '/',
        ...categoryHrefs,
        '/search',
        '/',
        ...categoryHrefs,
        ...legal.map((item) => item.href),
      ]

      const reached: string[] = []

      // Generous enough to step past the links the page itself carries between
      // the header and the footer, and bounded so a tab loop cannot spin.
      for (let press = 0; press < 40 && reached.length < expected.length; press++) {
        await page.keyboard.press('Tab')

        const stop = await page.evaluate(() => {
          const active = document.activeElement as HTMLElement | null

          if (!active) return null

          const style = getComputedStyle(active)

          return {
            focusVisible: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
            href: active.getAttribute('href'),
            inChrome: Boolean(active.closest('header, footer')),
          }
        })

        if (!stop?.inChrome || !stop.href) continue

        expect(stop.focusVisible, `${stop.href} should show a focus ring`).toBe(true)
        reached.push(stop.href)
      }

      expect(reached).toEqual(expected)
    })
  })

  test.describe('at a phone width', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('everything in the chrome is still reachable, and nothing spills sideways', async ({
      page,
    }) => {
      await page.goto(HOME)

      const header = page.getByRole('banner')

      await expect(header.getByRole('link', { name: 'EncryptStream' })).toBeVisible()
      await expect(header.getByRole('link', { name: 'Search' })).toBeVisible()
      await expect(header.getByRole('combobox', { name: 'Select a theme' })).toBeVisible()

      for (const category of categories) {
        await expect(header.getByRole('link', { name: category.title })).toBeVisible()
      }

      const spills = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(spills).toBe(false)
    })
  })

  test.describe('both themes', () => {
    test('the chrome sits on the brand surfaces', async ({ page }) => {
      await page.goto(HOME)

      const header = page.getByRole('banner')
      const footer = page.getByRole('contentinfo')

      await expect(header).toHaveCSS('background-color', 'rgb(8, 8, 11)')
      await expect(header).toHaveCSS('border-bottom-color', 'rgb(38, 38, 47)')
      await expect(footer).toHaveCSS('background-color', 'rgb(16, 16, 21)')
      await expect(footer).toHaveCSS('border-top-color', 'rgb(38, 38, 47)')

      await storeThemePreference(page, 'light')
      await page.reload()

      await expect(header).toHaveCSS('background-color', 'rgb(251, 251, 253)')
      await expect(header).toHaveCSS('border-bottom-color', 'rgb(229, 229, 235)')
      await expect(footer).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      await expect(footer).toHaveCSS('border-top-color', 'rgb(229, 229, 235)')
    })

    test('chrome links are set in the interface typeface, and read in both themes', async ({
      page,
    }) => {
      await page.goto(HOME)

      const link = page.getByRole('banner').getByRole('link', { name: categories[0].title })

      await expect(link).toHaveCSS('font-family', /IBM Plex Sans/)
      await expect(link).toHaveCSS('color', 'rgb(140, 140, 154)')

      await storeThemePreference(page, 'light')
      await page.reload()

      await expect(link).toHaveCSS('color', 'rgb(60, 60, 70)')
    })
  })
})
