import { expect, test } from '@playwright/test'

import { articlePageFixture, cleanupArticlePage, seedArticlePage } from '../helpers/seedArticlePage'
import {
  cleanupListingArticles,
  listingArticlesFixture,
  seedListingArticles,
} from '../helpers/seedListingArticles'
import { cleanupNavigationUser, seedNavigation } from '../helpers/seedNavigation'
import { cleanupRedirects, seedRedirectToArticle } from '../helpers/seedRedirect'

const HOME = 'http://localhost:3000'

/**
 * The addresses Articles live at. A URL describes what it points at, so the
 * word in the path is the canonical one — "article", never the collection slug
 * that happens to store it.
 */
test.describe('Article addresses', () => {
  test.beforeAll(async () => {
    await seedArticlePage()
    await seedListingArticles()
    await seedNavigation()
  })

  test.afterAll(async () => {
    await cleanupArticlePage()
    await cleanupListingArticles()
    await cleanupNavigationUser()
  })

  test('an Article renders at /articles/<slug>', async ({ page }) => {
    await page.goto(`${HOME}/articles/${articlePageFixture.slug}`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(articlePageFixture.title)
  })

  test('the listing renders at /articles, and its cards lead to /articles/<slug>', async ({
    page,
  }) => {
    await page.goto(`${HOME}/articles`)

    const card = page.getByRole('article').first()

    await expect(card).toBeVisible()
    await expect(card.getByRole('link').first()).toHaveAttribute('href', /^\/articles\//)
  })

  test('the listing paginates to /articles/page/<n>', async ({ page }) => {
    await page.goto(`${HOME}/articles`)

    await page.getByRole('button', { name: 'Go to next page' }).click()

    await expect(page).toHaveURL(`${HOME}/articles/page/2`)
  })

  test('the sitemap lists Articles at their new addresses, and at no old one', async ({
    request,
  }) => {
    const sitemap = await (await request.get(`${HOME}/articles-sitemap.xml`)).text()

    expect(sitemap).toContain(`/articles/${articlePageFixture.slug}`)
    expect(sitemap).not.toContain('/posts')
  })

  test('a search result leads to the Article at its new address', async ({ page }) => {
    await page.goto(`${HOME}/search?q=${encodeURIComponent(articlePageFixture.title)}`)

    await page.getByRole('link', { name: articlePageFixture.title }).click()

    await expect(page).toHaveURL(`${HOME}/articles/${articlePageFixture.slug}`)
  })

  test('no internal link anywhere points at an old address', async ({ page }) => {
    const pages = [
      '/',
      '/articles',
      `/articles/${articlePageFixture.slug}`,
      `/search?q=${encodeURIComponent(articlePageFixture.title)}`,
    ]

    for (const path of pages) {
      await page.goto(`${HOME}${path}`)

      const stale = await page
        .locator('a[href]')
        .evaluateAll((links) =>
          links
            .map((link) => link.getAttribute('href') ?? '')
            .filter((href) => /^\/posts(\/|\?|$)/.test(href)),
        )

      expect(stale, `stale links on ${path}`).toEqual([])
    }
  })

  test('the listing calls them Articles, in its heading, its title and its count', async ({
    page,
  }) => {
    await page.goto(`${HOME}/articles`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Articles')
    await expect(page).toHaveTitle(/Articles/)
    await expect(page.getByText(/^Showing /)).toContainText(/ Articles$/)
  })

  test('a redirect to an Article lands on its new address', async ({ page }) => {
    const from = '/a-forwarded-address'

    try {
      await seedRedirectToArticle({ from, slug: articlePageFixture.slug })

      await page.goto(`${HOME}${from}`)

      await expect(page).toHaveURL(`${HOME}/articles/${articlePageFixture.slug}`)
    } finally {
      await cleanupRedirects({ from })
    }
  })

  test('a link written into an Article body points at the new address', async ({ page }) => {
    await page.goto(`${HOME}/articles/${listingArticlesFixture.slugPrefix}1`)

    await expect(
      page.getByRole('link', { name: listingArticlesFixture.crossLinkText }),
    ).toHaveAttribute('href', `/articles/${listingArticlesFixture.slugPrefix}2`)
  })
})
