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
  const photoRequests: string[] = [];
  alice.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/photos/')) photoRequests.push(request.url());
  });
  alice.on('pageerror', (error) => errors.push(error.message));
  bob.on('pageerror', (error) => errors.push(error.message));
  await alice.goto('/');
  await expect(alice.getByRole('heading', { name: 'Boards', exact: true })).toBeVisible();
  await alice.getByRole('button', { name: 'Open menu' }).click();
  await alice.getByRole('button', { name: 'New board', exact: true }).click();
  await alice.getByLabel('Board name').fill('Our food visits');
  await alice
    .getByLabel('Description (optional)')
    .fill('Little restaurants, long conversations, and one more bite.');
  await alice.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(alice.getByRole('heading', { name: 'Our food visits', exact: true })).toBeVisible();
  const boardUrl = alice.url();
  await alice.getByRole('link', { name: 'Board settings' }).click();
  await expect(alice.getByLabel('Store new photos in')).toHaveValue('convex');
  await expect(
    alice.getByLabel('Store new photos in').locator('option[value="local"]'),
  ).toHaveCount(1);
  await alice.getByRole('button', { name: 'Create invitation link' }).click();
  const inviteLink = await alice.getByLabel('Invitation link', { exact: true }).inputValue();
  await bob.goto(inviteLink);
  await expect(bob.getByRole('button', { name: 'Request to join' })).toBeVisible();
  await bob.getByRole('button', { name: 'Request to join' }).click();
  await expect(bob.getByRole('button', { name: 'Request pending' })).toBeDisabled();
  await alice.getByRole('button', { name: 'Accept', exact: true }).click();
  await bob.getByRole('button', { name: 'Open board', exact: true }).click();
  await expect(bob.getByRole('heading', { name: 'Our food visits', exact: true })).toBeVisible();
  await bob.goto(`${boardUrl}/settings`);
  await expect(bob.getByRole('heading', { name: 'Board Settings' })).toBeVisible();
  await expect(bob.getByLabel('Store new photos in')).toHaveCount(0);
  await alice.goto(boardUrl);
  await alice.getByRole('link', { name: 'Add visit', exact: true }).click();
  await alice.getByRole('button', { name: 'Choose place', exact: true }).click();
  await alice.getByText('Enter place details manually or adjust the pin').click();
  await alice.getByLabel('Place name', { exact: true }).fill('A Friday well spent');
  await alice.getByLabel('Address (optional)').fill('The Little Table');
  await alice.getByRole('button', { name: 'Use this place' }).click();
  await alice.locator('.visit-date-control > summary').click();
  await alice.getByLabel('When was it?').fill('2026-09-18');
  await alice.locator('.visit-date-control > summary').click();
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
  await dish.getByRole('button', { name: 'Add my rating' }).click();
  await alice.getByLabel('Your score', { exact: false }).fill('8.5');
  await alice.getByLabel('A little note').fill('Creamy, fresh, and gone in minutes.');
  await alice.getByRole('button', { name: 'Save rating' }).click();
  await expect(dish.getByText('8.5/10', { exact: true })).toBeVisible();
  await bob.goto(visitUrl);
  const shared = bob
    .getByRole('article')
    .filter({ has: bob.getByRole('heading', { name: 'Burrata & heirloom tomatoes' }) });
  await shared.getByRole('button', { name: 'Add my rating' }).click();
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
  expect(photoRequests.some((url) => new URL(url).pathname === '/photos/upload')).toBe(true);
  expect(photoRequests.every((url) => new URL(url).hostname.endsWith('.convex.site'))).toBe(true);
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
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Our little adventures' })).toBeVisible();
  const boardUrl = page.url();
  await page.getByRole('link', { name: 'Board settings' }).click();
  await page.getByRole('button', { name: 'Edit board details' }).click();
  await page.getByLabel('Board name', { exact: true }).fill('An unsaved name');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.board-details-summary strong')).toHaveText('Our little adventures');
  await page.getByRole('button', { name: 'Edit board details' }).click();
  await expect(page.getByLabel('Board name', { exact: true })).toHaveValue('Our little adventures');
  await page.getByLabel('Board name', { exact: true }).fill('Our weekend adventures');
  await page.getByRole('button', { name: 'Save board', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.board-details-summary strong')).toHaveText('Our weekend adventures');
  await page.getByRole('button', { name: 'New type' }).click();
  await page.getByLabel('Type name').fill('Trek');
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await page.getByLabel('Category 1', { exact: true }).fill('View');
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await page.getByLabel('Category 2', { exact: true }).fill('Trail');
  await noOverflow(page);
  await page.screenshot({ path: 'test-results/mobile-visit-type.png' });
  await page.getByRole('button', { name: 'Save visit type' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Trek', { exact: true })).toBeVisible();
  await expect(page.getByText('Board color', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit Trek type' }).click();
  await expect(page.getByLabel('Category 1', { exact: true })).toHaveValue('View');
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await page.getByLabel('Category 3', { exact: true }).fill('Weather');
  await page.getByRole('button', { name: 'Remove category 3', exact: true }).click();
  await page.getByRole('button', { name: 'Save visit type' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete board', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Delete “Our weekend adventures”?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.board-details-summary strong')).toHaveText('Our weekend adventures');
  await noOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('heading', { name: 'Board Settings' }).click();
  await page.screenshot({ path: 'test-results/mobile-settings.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await noOverflow(page);
  await page.screenshot({ path: 'test-results/desktop-settings.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(boardUrl);
  await page.getByRole('link', { name: 'Add visit', exact: true }).click();
  await page.getByRole('button', { name: 'Choose place', exact: true }).click();
  await page.getByText('Enter place details manually or adjust the pin').click();
  await page.getByLabel('Place name', { exact: true }).fill('Sunrise at the summit');
  await page.getByRole('button', { name: 'Use this place' }).click();
  await page.getByLabel('What kind of visit?').selectOption({ label: 'Trek' });
  await expect(page.getByLabel('Category 1', { exact: true })).toHaveValue('View');
  await expect(page.getByLabel('Category 2', { exact: true })).toHaveValue('Trail');
  await page.getByLabel('Category 2', { exact: true }).fill(' view ');
  await page.getByRole('button', { name: 'Create visit', exact: true }).click();
  expect(
    await page
      .getByLabel('Category 2', { exact: true })
      .evaluate((input: HTMLInputElement) => input.validationMessage),
  ).toContain('different category');
  await expect(page.getByLabel('Visit name', { exact: true })).toHaveValue('Sunrise at the summit');
  await page.getByLabel('Category 2', { exact: true }).fill('Trail');
  await page.getByLabel('Overall rating for', { exact: false }).fill('8.5');
  await page.getByLabel('View rating for', { exact: false }).fill('9');
  await noOverflow(page);
  await page.getByRole('button', { name: 'Create visit', exact: true }).click();
  await expect(page.locator('.rating-card.overall .person-score')).toContainText('8.5');
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
  await page.goto(`${boardUrl}/settings`);
  await page.getByRole('button', { name: 'Delete board', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete board', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Boards', exact: true })).toBeVisible();
  await context.close();
});

test('visit uses the selected map place and saves an optional name override', async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: 'test-results/user-0.json',
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  await page.getByLabel('Board name').fill('Visit editor checks');
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Visit editor checks', exact: true }),
  ).toBeVisible();
  const boardUrl = page.url();
  const selected = new URLSearchParams({
    title: 'Third Wave Coffee',
    place: 'Sai Paryavaran House, ITPL Main Rd, Bengaluru',
    lat: '12.963289',
    lng: '77.7170321',
  });
  await page.goto(`${boardUrl}/visits/new?${selected}`);
  await expect(page.getByLabel('Visit name', { exact: true })).toHaveValue('Third Wave Coffee');
  await expect(page.getByRole('region', { name: 'Visit location', exact: true })).toBeVisible();
  await expect(page.getByLabel('When was it?')).toBeHidden();
  await page.getByLabel('Visit name', { exact: true }).fill('Coffee after our walk');
  await page.getByLabel('A note to remember').fill('A quiet corner and a shared pastry.');
  await page.locator('.visit-date-control > summary').click();
  await page.getByRole('button', { name: 'Leave date blank' }).click();
  await page.locator('.visit-date-control > summary').click();
  await noOverflow(page);
  await page.screenshot({ path: 'test-results/mobile-visit-editor.png', fullPage: true });
  await page.getByRole('button', { name: 'Create visit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Coffee after our walk' })).toBeVisible();
  await page.getByRole('link', { name: 'Edit visit', exact: true }).click();
  await expect(page.getByLabel('Visit name', { exact: true })).toHaveValue('Coffee after our walk');
  await expect(page.getByLabel('A note to remember')).toHaveValue(
    'A quiet corner and a shared pastry.',
  );
  await expect(page.getByRole('link', { name: 'Google Maps', exact: true })).toHaveAttribute(
    'href',
    /12\.963289%2C77\.7170321/,
  );
  await page.getByRole('button', { name: 'Edit place', exact: true }).click();
  await page.getByText('Enter place details manually or adjust the pin').click();
  await page.getByLabel('Place name', { exact: true }).fill('Discarded change');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('Visit name', { exact: true })).toHaveValue('Coffee after our walk');
  await page.getByLabel('Visit name', { exact: true }).fill('Our favorite coffee stop');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Our favorite coffee stop' })).toBeVisible();
  await context.close();
});

test('members invite others while the owner approves access', async ({ browser }) => {
  const owner = await browser.newContext({ storageState: 'test-results/user-0.json' });
  const member = await browser.newContext({
    storageState: 'test-results/user-1.json',
    viewport: { width: 390, height: 844 },
  });
  const alice = await owner.newPage();
  const bob = await member.newPage();
  const guestContext = await browser.newContext({ storageState: 'test-results/user-2.json' });
  const guest = await guestContext.newPage();
  const errors: string[] = [];
  bob.on('pageerror', (error) => errors.push(error.message));
  await alice.goto('/boards');
  await expect(alice.getByRole('heading', { name: 'Boards', exact: true })).toBeVisible();
  await alice.getByRole('button', { name: 'Open menu' }).click();
  await alice.getByRole('button', { name: 'New board', exact: true }).click();
  await alice.getByLabel('Board name').fill('Settings permissions');
  await alice.getByRole('button', { name: 'Create board', exact: true }).click();
  await expect(
    alice.getByRole('heading', { name: 'Settings permissions', exact: true }),
  ).toBeVisible();
  const boardUrl = alice.url();
  await alice.goto(`${boardUrl}/settings`);
  await alice.getByRole('button', { name: 'Create invitation link' }).click();
  await bob.goto(await alice.getByLabel('Invitation link', { exact: true }).inputValue());
  await bob.getByRole('button', { name: 'Request to join' }).click();
  await expect(bob.getByRole('button', { name: 'Request pending' })).toBeDisabled();
  await alice.getByRole('button', { name: 'Accept', exact: true }).click();
  await bob.getByRole('button', { name: 'Open board', exact: true }).click();
  await expect(
    bob.getByRole('heading', { name: 'Settings permissions', exact: true }),
  ).toBeVisible();
  await bob.goto(`${boardUrl}/settings`);
  await expect(bob.getByRole('heading', { name: 'Board Settings', exact: true })).toBeVisible();
  await expect(bob.locator('.board-details-summary strong')).toHaveText('Settings permissions');
  await expect(bob.getByRole('button', { name: 'Edit board details' })).toBeDisabled();
  await expect(bob.getByRole('button', { name: 'Delete board', exact: true })).toBeDisabled();
  await expect(bob.getByRole('button', { name: 'Copy link' })).toBeEnabled();
  await expect(bob.getByRole('button', { name: 'Revoke link' })).toBeDisabled();
  await expect(bob.getByRole('button', { name: 'Copy code' })).toBeEnabled();
  await expect(bob.getByRole('button', { name: 'Regenerate invite code' })).toBeDisabled();
  const removalButtons = bob.locator('.member-row button');
  await expect(removalButtons).toHaveCount(2);
  for (const button of await removalButtons.all()) await expect(button).toBeDisabled();
  await expect(bob.getByRole('button', { name: 'New type' })).toBeEnabled();
  await expect(bob.getByRole('heading', { name: 'This page is unavailable' })).toHaveCount(0);
  await alice.getByRole('button', { name: 'Revoke link' }).click();
  await alice.getByRole('button', { name: 'Yes, remove' }).click();
  await bob.getByRole('button', { name: 'Create invitation link' }).click();
  const sharedLink = await bob.getByLabel('Invitation link', { exact: true }).inputValue();
  await guest.goto(sharedLink);
  await guest.getByRole('button', { name: 'Request to join' }).click();
  await expect(guest.getByRole('button', { name: 'Request pending' })).toBeDisabled();
  await guest.reload();
  await expect(guest.getByRole('button', { name: 'Request pending' })).toBeDisabled();
  await expect(bob.locator('.member-row')).toHaveCount(2);
  await expect(bob.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0);
  await alice.getByRole('button', { name: 'Accept', exact: true }).click();
  await guest.getByRole('button', { name: 'Open board', exact: true }).click();
  await expect(
    guest.getByRole('heading', { name: 'Settings permissions', exact: true }),
  ).toBeVisible();
  await expect(bob.locator('.member-row')).toHaveCount(3);
  await noOverflow(bob);
  await bob.screenshot({ path: 'test-results/mobile-member-settings.png', fullPage: true });
  expect(errors).toEqual([]);
  await expect(alice.getByRole('button', { name: 'Edit board details' })).toBeEnabled();
  await expect(alice.getByRole('button', { name: 'Delete board', exact: true })).toBeEnabled();
  await owner.close();
  await member.close();
  await guestContext.close();
});
