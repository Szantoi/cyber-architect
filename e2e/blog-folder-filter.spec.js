import { test, expect } from '@playwright/test';

const BLOG_POSTS = [
  {
    id: 701,
    slug: 'e2e-cad-blog',
    title: 'CAD automatizáció mérnöki szemmel',
    summary: 'Rajzfeldolgozás és gyártáselőkészítés szoftveresen.',
    category: '02_CAD_Automatizacio',
    drive_path: 'blog/02_CAD_Automatizacio/e2e-cad-blog',
    dimensions: { iparag: ['E2E'], technologia: ['CAD'], celcsoport: ['E2E'] },
    read_time: '5 PERC',
    created_at: '2026-08-20'
  },
  {
    id: 702,
    slug: 'e2e-lean-blog',
    title: 'Lean gyártási tapasztalatok',
    summary: 'Termelési folyamatok gyakorlati fejlesztése.',
    category: 'GYÁRTÁSI NAPLÓ',
    drive_path: 'blog/03_Lean/e2e-lean-blog',
    dimensions: { iparag: ['E2E'], technologia: ['Lean'], celcsoport: ['E2E'] },
    read_time: '4 PERC',
    created_at: '2026-08-19'
  }
];

test('a Blog egyszerű kategóriaszűrője kliensoldalon vált cikklistát', async ({ page }) => {
  const requestedUrls = [];

  await page.route((url) => (
    url.pathname === '/api/documents'
      && url.searchParams.get('presentation_profile') === 'article'
  ), async (route) => {
    requestedUrls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documents: BLOG_POSTS.map((post) => ({
        ...post,
        content_type: 'blog',
        presentation_profile: 'article'
      })) })
    });
  });

  await page.goto('/blog', { waitUntil: 'domcontentloaded' });

  const cards = page.getByTestId('blog-article-card');
  await expect(cards).toHaveCount(BLOG_POSTS.length);
  // React Strict Mode may perform a second initial read in development. Capture
  // the settled baseline; the category change itself must not add a request.
  await page.waitForTimeout(250);
  const initialRequestCount = requestedUrls.length;

  const category = page.locator(
    `[data-testid="blog-category-filter"][data-category="02_CAD_Automatizacio"]`
  );
  await expect(category).toBeVisible();
  await category.click();

  // A theme switch only filters the locally loaded editorial archive; it
  // should not turn the human-friendly category label into a server filter.
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('CAD automatizáció');

  await page.waitForTimeout(250);
  expect(requestedUrls).toHaveLength(initialRequestCount);
  expect(requestedUrls.every((url) => !new URL(url).searchParams.has('category'))).toBe(true);
});
