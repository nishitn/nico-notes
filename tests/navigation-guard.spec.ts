import { expect, test } from '@playwright/test';

test('navigation cancellation preserves drafts and successful saves bypass the guard', async ({
  page,
}) => {
  await page.goto('/test-fixtures/navigation.html');
  await page.getByRole('link', { name: 'Leave', exact: true }).click();
  await page.getByRole('link', { name: 'Open editor' }).click();
  await page.getByLabel('Draft').fill('Important note');
  let handled = page.waitForEvent('dialog').then((dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Leave', exact: true }).click();
  await handled;
  await expect(page.getByLabel('Draft')).toHaveValue('Important note');
  handled = page.waitForEvent('dialog').then((dialog) => dialog.dismiss());
  await page.evaluate(() => history.back());
  await handled;
  await expect(page).toHaveURL(/navigation\.html$/);
  await expect(page.getByLabel('Draft')).toHaveValue('Important note');
  handled = page.waitForEvent('dialog').then((dialog) => dialog.accept());
  await page.evaluate(() => history.back());
  await handled;
  await expect(page.getByRole('heading', { name: 'Next', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Open editor' }).click();
  await page.getByLabel('Draft').fill('Saved note');
  const unexpectedDialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    unexpectedDialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Next', exact: true })).toBeVisible();
  expect(unexpectedDialogs).toEqual([]);
});
