import { expect, test, type Locator, type Page } from '@playwright/test'

import { storeThemePreference } from '../helpers/theme'
import {
  cleanupRelatedPosts,
  relatedPostsFixture,
  seedRelatedPosts,
} from '../helpers/seedRelatedPosts'
import {
  articlesPerPage,
  cleanupIndexArticles,
  indexArticlesFixture,
  indexArticleTitlesIn,
  indexCategorySlug,
  indexCategoryTitles,
  seedIndexArticles,
} from '../helpers/seedIndexArticles'

const HOME = 'http://localhost:3000'

/** The titles of the Article cards on the page. */
const cardTitles = (page: Page) => page.getByRole('article').getByRole('heading', { level: 3 })

const isFixture = (title: string) => title.startsWith(indexArticlesFixture.titlePrefix)

/**
 * Which of this spec's Articles the index is showing, whatever order it shows
 * them in and whatever else is in the collection.
 *
 * Only the fixtures are counted: the suite shares one database and other specs
 * leave Articles of their own in it, so a filtered listing is judged by which
 * of *these* Articles survived the filter. Polled rather than read once,
 * because a filter followed by a click has a navigation in between. Order is
 * deliberately not asserted: which Articles a category holds is the behaviour,
 * and the sort is not this issue's to fix.
 */
const narrowsTo = async (page: Page, category: string) => {
  await expect
    .poll(async () => (await cardTitles(page).allTextContents()).filter(isFixture).sort())
    .toEqual([...indexArticleTitlesIn(category)].sort())
}

/**
 * How the grid holding a card lays its cards out: the nearest grid ancestor's
 * track count and gaps. Read from the browser rather than from class names, so
 * a refactor that keeps the layout keeps the test.
 */
const gridLayout = (card: Locator) =>
  card.evaluate((element) => {
    let node: HTMLElement | null = element as HTMLElement

    while (node && getComputedStyle(node).display !== 'grid') node = node.parentElement

    if (!node) throw new Error('The card is not in a grid')

    const style = getComputedStyle(node)

    return {
      columnGap: style.columnGap,
      columns: style.gridTemplateColumns.split(' ').length,
      rowGap: style.rowGap,
    }
  })

/**
 * The index a reader browses when they do not have a search term — every
 * Article, and a way to narrow it to the one thing they came about.
 */
test.describe('The Article index', () => {
  test.beforeAll(async () => {
    await seedIndexArticles()
  })

  test.afterAll(async () => {
    await cleanupIndexArticles()
  })

  test('a category narrows the index to the Articles in it', async ({ page }) => {
    await page.goto(`${HOME}/articles?category=${indexCategorySlug('Comparisons')}`)

    await narrowsTo(page, 'Comparisons')
  })

  test('it offers a filter for every category that exists, and one narrows the set', async ({
    page,
  }) => {
    await page.goto(`${HOME}/articles`)

    const filters = page.getByRole('navigation', { name: 'Filter Articles by category' })

    for (const category of indexCategoryTitles()) {
      await expect(filters.getByRole('link', { name: category, exact: true })).toBeVisible()
    }

    await filters.getByRole('link', { name: 'Platform guides', exact: true }).click()

    await narrowsTo(page, 'Platform guides')
  })

  test('paging through a narrowed index keeps the category', async ({ page }) => {
    const category = indexCategorySlug('Piracy problems')

    await page.goto(`${HOME}/articles?category=${category}`)

    const firstPage = await cardTitles(page).allTextContents()

    expect(firstPage).toHaveLength(articlesPerPage)

    await page.getByRole('button', { name: 'Go to next page' }).click()

    await expect(page).toHaveURL(`${HOME}/articles/page/2?category=${category}`)

    // Every fixture in the category is on one of the two pages, and nothing
    // from another category is on either.
    await expect
      .poll(async () =>
        [...firstPage, ...(await cardTitles(page).allTextContents())].filter(isFixture).sort(),
      )
      .toEqual([...indexArticleTitlesIn('Piracy problems')].sort())
  })

  test('a card says what the Article is about without opening it', async ({ page }) => {
    await page.goto(`${HOME}/articles?category=${indexCategorySlug('Platform guides')}`)

    const title = indexArticleTitlesIn('Platform guides')[0]!
    const card = page.getByRole('article').filter({ hasText: title })

    await expect(card).toContainText('Platform guides')
    await expect(card).toContainText(title)
    await expect(card).toContainText('in one line.')
  })

  /*
   * "The card treatment established by the related Articles grid, not a second
   * implementation" is a claim about layout, so it is checked as one: the same
   * track count and the same gaps in both places.
   */
  test('it lays Articles out in the related Articles grid rather than a second one', async ({
    page,
  }) => {
    await seedRelatedPosts()

    try {
      await page.goto(`${HOME}/articles/${relatedPostsFixture.postSlug}`)

      const related = await gridLayout(
        page.getByRole('region', { name: 'Related Articles' }).getByRole('article').first(),
      )

      await page.goto(`${HOME}/articles`)

      expect(await gridLayout(page.getByRole('article').first())).toEqual(related)
    } finally {
      await cleanupRelatedPosts()
    }
  })

  /*
   * Narrowing is navigation, not a control. A filtered index is a real address
   * a reader can bookmark or send to somebody, and it has to arrive filtered
   * from the server — so the whole thing works with scripting switched off.
   */
  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false })

    test('the filters are still links, and following one still narrows the set', async ({
      page,
    }) => {
      await page.goto(`${HOME}/articles`)

      const filters = page.getByRole('navigation', { name: 'Filter Articles by category' })

      await filters.getByRole('link', { name: 'Comparisons', exact: true }).click()

      await expect(page).toHaveURL(`${HOME}/articles?category=${indexCategorySlug('Comparisons')}`)
      await narrowsTo(page, 'Comparisons')
    })
  })

  test.describe('at a phone width', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('the cards stack in one column and nothing spills sideways', async ({ page }) => {
      await page.goto(`${HOME}/articles`)

      expect(await gridLayout(page.getByRole('article').first())).toMatchObject({ columns: 1 })

      const filters = page.getByRole('navigation', { name: 'Filter Articles by category' })

      for (const category of indexCategoryTitles()) {
        await expect(filters.getByRole('link', { name: category, exact: true })).toBeVisible()
      }

      const spills = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(spills).toBe(false)
    })
  })

  test('every filter is reachable by keyboard and shows where the reader is', async ({ page }) => {
    await page.goto(`${HOME}/articles`)
    await page.locator('body').click({ position: { x: 1, y: 1 } })

    /*
     * Which filters exist is asserted elsewhere; what this test is about is
     * that every one of them can be reached and shows where the reader is. So
     * the expectation is the filters the page actually rendered.
     */
    const expected = await page
      .getByRole('navigation', { name: 'Filter Articles by category' })
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')))

    const reached: string[] = []

    // Bounded so a tab loop cannot spin, and generous enough to step past the
    // chrome the page carries above the filters.
    for (let press = 0; press < 40 && reached.length < expected.length; press++) {
      await page.keyboard.press('Tab')

      const stop = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null

        if (!active) return null

        const style = getComputedStyle(active)

        return {
          focusVisible: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
          href: active.getAttribute('href'),
          inFilters: Boolean(active.closest('nav[aria-label="Filter Articles by category"]')),
        }
      })

      if (!stop?.inFilters || !stop.href) continue

      expect(stop.focusVisible, `${stop.href} should show a focus ring`).toBe(true)
      reached.push(stop.href)
    }

    expect(reached).toEqual(expected)
  })

  test('the filter a reader is on is marked, and sits on a brand panel in either theme', async ({
    page,
  }) => {
    await page.goto(`${HOME}/articles?category=${indexCategorySlug('Comparisons')}`)

    const filters = page.getByRole('navigation', { name: 'Filter Articles by category' })
    const active = filters.getByRole('link', { name: 'Comparisons', exact: true })

    await expect(active).toHaveAttribute('aria-current', 'page')
    await expect(filters.getByRole('link', { name: 'All Articles' })).not.toHaveAttribute(
      'aria-current',
      'page',
    )

    await expect(active).toHaveCSS('background-color', 'rgb(16, 16, 21)')
    await expect(active).toHaveCSS('border-top-color', 'rgb(38, 38, 47)')

    await storeThemePreference(page, 'light')
    await page.reload()

    await expect(active).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(active).toHaveCSS('border-top-color', 'rgb(229, 229, 235)')
  })

  /*
   * The category links live in the header global, so they can outlive the
   * category they name. A reader following one is better served the whole index
   * than an empty page telling them nothing exists.
   */
  test('a link to a category that no longer exists shows the whole index', async ({ page }) => {
    await page.goto(`${HOME}/articles?category=a-category-that-was-renamed`)

    const filters = page.getByRole('navigation', { name: 'Filter Articles by category' })

    await expect(filters.getByRole('link', { name: 'All Articles' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('article').first()).toBeVisible()
  })
})
