import { expect, test, type Page } from '@playwright/test'

import { defaultAuthor } from '../../src/endpoints/seed/author.js'
import { articlePageFixture, cleanupArticlePage, seedArticlePage } from '../helpers/seedArticlePage'
import { launchArticles, seedLaunchArticles } from '../helpers/seedLaunchArticles'
import { storeThemePreference } from '../helpers/theme'
import { cleanupGlobalsUser, writeGlobal } from '../helpers/writeGlobal'

const HOME = 'http://localhost:3000'
const ARTICLE = `${HOME}/posts/${articlePageFixture.slug}`

/** Puts a section at the top of the viewport, as scrolling to it would. */
async function scrollTo(page: Page, id: string): Promise<void> {
  await page.evaluate((target) => {
    document.getElementById(target)?.scrollIntoView()
  }, id)
}

test.describe('The Article page', () => {
  test.beforeAll(async () => {
    await seedArticlePage()
  })

  test.afterAll(async () => {
    await cleanupArticlePage()
    await cleanupGlobalsUser()
  })

  test.describe('table of contents', () => {
    test('lists the Article’s second and third level headings, in document order', async ({
      page,
    }) => {
      await page.goto(ARTICLE)

      const contents = page.getByRole('navigation', { name: 'On this page' })

      await expect(contents.getByRole('link')).toHaveText([
        articlePageFixture.topHeading,
        articlePageFixture.subheadingText,
        articlePageFixture.collidingHeading,
        articlePageFixture.collidingHeading,
      ])
    })

    test('anchors are derived from the heading’s own words, and a repeated heading gets its own', async ({
      page,
    }) => {
      await page.goto(ARTICLE)

      const hrefs = await page
        .getByRole('navigation', { name: 'On this page' })
        .getByRole('link')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href')))

      expect(hrefs).toEqual([
        '#how-a-licence-exchange-works',
        '#widevine-fairplay-and-playready',
        '#what-this-actually-costs',
        '#what-this-actually-costs-2',
      ])

      for (const href of hrefs) {
        await expect(page.locator(`article ${href}`)).toHaveCount(1)
      }
    })

    test('a contents entry takes the reader to the section it names', async ({ page }) => {
      await page.goto(ARTICLE)

      await page
        .getByRole('navigation', { name: 'On this page' })
        .getByRole('link', { name: articlePageFixture.subheadingText })
        .click()

      await expect(page).toHaveURL(`${ARTICLE}#widevine-fairplay-and-playready`)
      await expect(
        page.getByRole('heading', { name: articlePageFixture.subheadingText }),
      ).toBeInViewport()
    })

    test('the section being read is the one marked in the contents', async ({ page }) => {
      await page.goto(ARTICLE)

      const contents = page.getByRole('navigation', { name: 'On this page' })

      await scrollTo(page, 'what-this-actually-costs')

      await expect(
        contents.getByRole('link', { name: articlePageFixture.collidingHeading }).first(),
      ).toHaveAttribute('aria-current', 'true')

      await scrollTo(page, 'how-a-licence-exchange-works')

      await expect(
        contents.getByRole('link', { name: articlePageFixture.topHeading }),
      ).toHaveAttribute('aria-current', 'true')
    })

    test.describe('at a width too narrow for two columns', () => {
      test.use({ viewport: { height: 844, width: 390 } })

      test('the contents collapses to a disclosure below the hero, closed to start with', async ({
        page,
      }) => {
        await page.goto(ARTICLE)

        const summary = page.locator('summary', { hasText: 'On this page' })
        await expect(summary).toBeVisible()

        const entry = page
          .getByRole('navigation', { name: 'On this page' })
          .getByRole('link', { name: articlePageFixture.topHeading })
        await expect(entry).toBeHidden()

        const title = await page.getByRole('heading', { level: 1 }).boundingBox()
        const lede = await page.getByText(articlePageFixture.ledeText).boundingBox()
        const disclosure = await summary.boundingBox()

        expect(disclosure!.y).toBeGreaterThan(title!.y)
        expect(disclosure!.y).toBeLessThan(lede!.y)

        await summary.click()
        await expect(entry).toBeVisible()
      })
    })

    test('with JavaScript switched off it is still a list of links to the sections', async ({
      browser,
    }) => {
      const context = await browser.newContext({ javaScriptEnabled: false })
      const page = await context.newPage()

      await page.goto(ARTICLE)

      const contents = page.getByRole('navigation', { name: 'On this page' })
      await expect(contents.getByRole('link')).toHaveCount(4)

      await contents.getByRole('link', { name: articlePageFixture.topHeading }).click()

      await expect(page).toHaveURL(`${ARTICLE}#how-a-licence-exchange-works`)
      await expect(
        page.getByRole('heading', { name: articlePageFixture.topHeading }),
      ).toBeInViewport()

      await context.close()
    })
  })

  test.describe('hero', () => {
    test('carries the category, the title and the publication date', async ({ page }) => {
      await page.goto(ARTICLE)

      const hero = page.locator('article > header')

      await expect(hero.getByText(articlePageFixture.category)).toBeVisible()
      await expect(hero.getByRole('heading', { level: 1 })).toHaveText(articlePageFixture.title)
      await expect(hero.locator('time')).toHaveText('11 February 2026')
    })

    test('exactly one radial glow is painted on the page, and it sits behind the hero', async ({
      page,
    }) => {
      await page.goto(ARTICLE)

      const glows = await page.evaluate(() =>
        Array.from(document.querySelectorAll('body *'))
          .filter((element) => getComputedStyle(element).backgroundImage.includes('radial-gradient'))
          .map((element) => {
            const { bottom, top } = element.getBoundingClientRect()

            return { bottom, top }
          }),
      )

      expect(glows).toHaveLength(1)

      const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!

      expect(glows[0]!.top).toBeLessThanOrEqual(title.y)
      expect(glows[0]!.bottom).toBeGreaterThanOrEqual(title.y + title.height)
    })
  })

  test.describe('the body as a document', () => {
    test('a line of body copy runs to about 65 characters, not the width of the monitor', async ({
      page,
    }) => {
      await page.setViewportSize({ height: 900, width: 1600 })
      await page.goto(ARTICLE)

      const { measure, sixtyFiveCharacters } = await page.evaluate((lede) => {
        const paragraph = Array.from(document.querySelectorAll('article p')).find((node) =>
          node.textContent?.includes(lede),
        )!

        const probe = document.createElement('span')
        probe.style.cssText = 'position:absolute;visibility:hidden;width:65ch'
        probe.style.font = getComputedStyle(paragraph).font
        paragraph.append(probe)

        const sixtyFive = probe.getBoundingClientRect().width
        probe.remove()

        return {
          measure: paragraph.getBoundingClientRect().width,
          sixtyFiveCharacters: sixtyFive,
        }
      }, articlePageFixture.ledeText)

      expect(measure).toBeLessThanOrEqual(sixtyFiveCharacters * 1.05)
    })

    test('a figure carries its caption as a source line beneath the picture', async ({ page }) => {
      await page.goto(ARTICLE)

      const figure = page.locator('article figure')
      await expect(figure).toHaveCount(1)

      const caption = figure.locator('figcaption')
      await expect(caption).toHaveText(articlePageFixture.figureCaption)

      const picture = (await figure.getByRole('img').boundingBox())!
      const source = (await caption.boundingBox())!

      expect(source.y).toBeGreaterThanOrEqual(picture.y + picture.height)
    })

    test('the Article’s words are readable before its pictures arrive', async ({ page }) => {
      await page.route('**/_next/image**', () => {
        // Left hanging: the images never arrive for the length of this test.
      })

      await page.goto(ARTICLE, { waitUntil: 'commit' })

      await expect(page.getByRole('heading', { level: 1 })).toHaveText(articlePageFixture.title)
      await expect(page.getByText(articlePageFixture.ledeText)).toBeVisible()
    })

    test('a picture sits on a panel and a hairline, so it is legible on either ground', async ({
      page,
    }) => {
      await page.goto(ARTICLE)

      const surface = page.locator('article figure').locator('div').first()

      await expect(surface).toHaveCSS('background-color', 'rgb(16, 16, 21)')
      await expect(surface).toHaveCSS('border-top-color', 'rgb(38, 38, 47)')

      await storeThemePreference(page, 'light')
      await page.reload()

      await expect(surface).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      await expect(surface).toHaveCSS('border-top-color', 'rgb(229, 229, 235)')
    })
  })

  test.describe('the ten Articles the site launches with', () => {
    test.beforeAll(async () => {
      await seedLaunchArticles()
    })

    test('every one of them renders, unmodified, in both themes', async ({ page }) => {
      expect(launchArticles).toHaveLength(10)

      for (const theme of ['dark', 'light'] as const) {
        await storeThemePreference(page, theme)

        for (const article of launchArticles) {
          await page.goto(`${HOME}/posts/${article.slug}`)

          await expect(page.getByRole('heading', { level: 1 })).toHaveText(article.title)
          await expect(page.locator('article > header')).toContainText(article.category)

          // The contents is derived from the headings, so an Article whose
          // sections did not render would show up as a short one.
          await expect(
            page.getByRole('navigation', { name: 'On this page' }).getByRole('link'),
          ).toHaveCount(article.sections.length)
        }
      }
    })
  })

  test.describe('related Articles', () => {
    test('the Article closes on a card showing enough to judge the next one', async ({ page }) => {
      await page.goto(ARTICLE)

      const grid = page.getByRole('region', { name: 'Related Articles' })
      const card = grid.getByRole('article')

      await expect(card).toHaveCount(1)
      await expect(card.getByRole('link', { name: articlePageFixture.relatedTitle })).toHaveAttribute(
        'href',
        `/posts/${articlePageFixture.relatedSlug}`,
      )
      await expect(card).toContainText(articlePageFixture.category)
      await expect(card).toContainText('What the related Article is about, in one line.')
    })

    test('the card is on the brand: a hairline and a card radius, and no shadow', async ({
      page,
    }) => {
      await page.goto(ARTICLE)

      const card = page.getByRole('region', { name: 'Related Articles' }).getByRole('article')

      await expect(card).toHaveCSS('border-radius', '16px')
      await expect(card).toHaveCSS('border-top-color', 'rgb(38, 38, 47)')
      await expect(card).toHaveCSS('box-shadow', 'none')
      await expect(card).toHaveCSS('background-color', 'rgb(16, 16, 21)')
    })
  })

  test.describe('reaching it without a mouse or a screen', () => {
    test('the heading hierarchy is well formed: one first level, and no level skipped', async ({
      page,
    }) => {
      await page.goto(ARTICLE)

      const levels = await page.evaluate(() =>
        Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((heading) =>
          Number(heading.tagName.slice(1)),
        ),
      )

      expect(levels.filter((level) => level === 1)).toHaveLength(1)
      expect(levels[0]).toBe(1)

      levels.forEach((level, index) => {
        if (index === 0) return

        expect(level).toBeLessThanOrEqual(levels[index - 1]! + 1)
      })
    })

    test('a keyboard reader can see what is selected', async ({ page }) => {
      await page.goto(ARTICLE)

      const entry = page
        .getByRole('navigation', { name: 'On this page' })
        .getByRole('link', { name: articlePageFixture.topHeading })

      await entry.focus()

      const indicator = await entry.evaluate((link) => {
        const style = getComputedStyle(link)

        return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth }
      })

      expect(indicator.outlineStyle).not.toBe('none')
      expect(parseFloat(indicator.outlineWidth)).toBeGreaterThan(0)
    })
  })

  test.describe('byline and biography', () => {
    test('the byline comes from site configuration, and the fixture Article sets no author', async ({
      page,
    }) => {
      await page.goto(ARTICLE)

      await expect(page.locator('article > header')).toContainText(`By ${defaultAuthor.name}`)
    })

    test('the biography appears once and describes the company, not a contributor', async ({
      page,
    }) => {
      await page.goto(ARTICLE)

      const biography = page.getByRole('heading', { name: 'Who is behind EncryptStream' })

      await expect(biography).toHaveCount(1)
      await expect(page.getByText(defaultAuthor.biography)).toBeVisible()
    })

    test('changing the site configuration changes the byline, without touching the Article', async ({
      page,
    }) => {
      await writeGlobal('author', { name: 'A Different Byline' })

      try {
        await page.goto(ARTICLE)

        await expect(page.locator('article > header')).toContainText('By A Different Byline')
      } finally {
        await writeGlobal('author', { name: defaultAuthor.name })
      }
    })
  })
})
