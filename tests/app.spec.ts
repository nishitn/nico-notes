import { test, expect, type Page } from '@playwright/test';

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}
test('two people share a board, rate a dish, upload a photo, and lose access after removal', async ({
  browser,
}) => {
  const a = await browser.newContext({
    storageState: 'test-results/user-0.json',
    viewport: { width: 1440, height: 1000 },
  });
  const b = await browser.newContext({
    storageState: 'test-results/user-1.json',
    viewport: { width: 390, height: 844 },
  });
  const outsider = await browser.newContext({ storageState: 'test-results/user-2.json' });
  const alice = await a.newPage();
  const bob = await b.newPage();
  const stranger = await outsider.newPage();
  const errors: string[] = [];
  alice.on('pageerror', (error) => errors.push(error.message));
  bob.on('pageerror', (error) => errors.push(error.message));
  await alice.goto('/');
  await expect(alice.getByRole('heading', { name: 'Boards', exact: true })).toBeVisible();
  await alice.getByRole('button', { name: 'Open menu' }).click();
  await alice.getByRole('button', { name: 'New board', exact: true }).click();
  await alice.getByLabel('Board name').fill('Our food dates');
  await alice
    .getByLabel('Description (optional)')
    .fill('Little restaurants, long conversations, and one more bite.');
  await alice.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(alice.getByRole('heading', { name: 'Our food dates', exact: true })).toBeVisible();
  const boardUrl = alice.url();
  await alice.getByRole('link', { name: 'Board settings' }).click();
  await alice.getByRole('button', { name: 'Create invitation link' }).click();
  const inviteLink = await alice.getByLabel('Invitation link', { exact: true }).inputValue();
  await bob.goto(inviteLink);
  await expect(bob.getByRole('button', { name: 'Accept invitation' })).toBeVisible();
  await bob.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(bob.getByRole('heading', { name: 'Our food dates', exact: true })).toBeVisible();
  await alice.goto(boardUrl);
  await alice.getByRole('link', { name: 'Add visit', exact: true }).click();
  await alice.getByLabel('Give this visit a name').fill('A Friday well spent');
  await alice.getByLabel('When was it?').fill('2026-09-18');
  await alice.getByLabel('Place or location').fill('The Little Table');
  await alice
    .getByLabel('A note to remember')
    .fill('We ordered too much and stayed for dessert. Worth it.');
  await alice.getByRole('button', { name: 'Create visit', exact: true }).click();
  await expect(alice.getByRole('heading', { name: 'A Friday well spent' })).toBeVisible();
  const visitUrl = alice.url();
  await alice.getByRole('button', { name: 'Add dish', exact: true }).click();
  await alice.getByLabel('Dish name').fill('Burrata & heirloom tomatoes');
  await alice.getByLabel('Description (optional)').fill('A shared plate. Extra sourdough, always.');
  await alice.getByRole('dialog').getByRole('button', { name: 'Add dish', exact: true }).click();
  const dish = alice
    .getByRole('article')
    .filter({ has: alice.getByRole('heading', { name: 'Burrata & heirloom tomatoes' }) });
  await dish.getByRole('button', { name: 'I tried this · Add my rating' }).click();
  await alice.getByLabel('Your score', { exact: false }).fill('8.5');
  await alice.getByLabel('A little note').fill('Creamy, fresh, and gone in minutes.');
  await alice.getByRole('button', { name: 'Save rating' }).click();
  await expect(dish.getByText('8.5/10', { exact: true })).toBeVisible();
  await bob.goto(visitUrl);
  const shared = bob
    .getByRole('article')
    .filter({ has: bob.getByRole('heading', { name: 'Burrata & heirloom tomatoes' }) });
  await shared.getByRole('button', { name: 'I tried this · Add my rating' }).click();
  await bob.getByLabel('Your score', { exact: false }).fill('9');
  await bob.getByLabel('A little note').fill('I would come back just for this.');
  await bob.getByRole('button', { name: 'Save rating' }).click();
  await expect(dish.getByText('I would come back just for this.')).toBeVisible();
  await expect(dish.locator('.average strong')).toHaveText('8.8');
  await alice.getByRole('button', { name: 'Add photo', exact: true }).click();
  await alice.getByLabel('Choose a photo').setInputFiles({
    name: 'our-table.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await alice.getByLabel('Caption (optional)').fill('Our little table');
  await alice.getByRole('button', { name: 'Save photo' }).click();
  await expect(alice.getByRole('img', { name: 'Our little table' })).toBeVisible();
  await expect(bob.getByRole('img', { name: 'Our little table' })).toBeVisible();
  await noOverflow(alice);
  await noOverflow(bob);
  await alice.screenshot({ path: 'test-results/desktop-visit.png', fullPage: true });
  await bob.screenshot({ path: 'test-results/mobile-visit.png', fullPage: true });
  await bob.getByRole('button', { name: 'Add a category' }).click();
  await bob.getByLabel('Category name').fill('Would come back');
  await bob.getByRole('button', { name: 'Add category', exact: true }).click();
  await expect(alice.getByRole('heading', { name: 'Would come back', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await stranger.goto(visitUrl);
  await expect(stranger.getByRole('heading', { name: 'This page is unavailable' })).toBeVisible();
  await alice.goto(`${boardUrl}/settings`);
  await alice.getByRole('button', { name: 'Remove Sam · browser test', exact: true }).click();
  await alice.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(bob.getByRole('heading', { name: 'This page is unavailable' })).toBeVisible();
  await alice.goto(boardUrl);
  await alice.screenshot({ path: 'test-results/desktop-board.png', fullPage: true });
  await a.close();
  await b.close();
  await outsider.close();
});

test('mobile visit types, keyboard dialogs, failed forms, and enlarged text', async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: 'test-results/user-3.json',
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  await page.getByLabel('Board name').fill('Our little adventures');
  await page.getByRole('radio', { name: 'sage', exact: true }).check();
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Our little adventures' })).toBeVisible();
  const boardUrl = page.url();
  await page.getByRole('link', { name: 'Board settings' }).click();
  await page.getByRole('button', { name: 'New type' }).click();
  await page.getByLabel('Type name').fill('Trek');
  await page.getByLabel('Preset rating categories').fill('View, Trail');
  await page.getByRole('button', { name: 'Save visit type' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Trek', { exact: true })).toBeVisible();
  await page.goto(boardUrl);
  await page.getByRole('link', { name: 'Add visit', exact: true }).click();
  await page.getByLabel('Give this visit a name').fill('Sunrise at the summit');
  await page.getByLabel('What kind of date?').selectOption({ label: 'Trek' });
  await expect(page.getByLabel('Rating categories')).toHaveValue('View, Trail');
  await page.getByLabel('Rating categories').fill('View, View');
  await page.getByRole('button', { name: 'Create visit', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('different category');
  await expect(page.getByLabel('Give this visit a name')).toHaveValue('Sunrise at the summit');
  await page.getByLabel('Rating categories').fill('View, Trail');
  await page.getByRole('button', { name: 'Create visit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sunrise at the summit' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'View', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add dish', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add a category' }).click();
  await expect(page.getByLabel('Category name')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await noOverflow(page);
  await page.screenshot({ path: 'test-results/mobile-large-text.png', fullPage: true });
  await context.close();
});
