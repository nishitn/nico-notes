import { expect, test } from '@playwright/test';

test('privacy and account deletion remain readable without signing in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy policy', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Contact support', exact: true })).toHaveAttribute(
    'href',
    'mailto:nishit.nagar1@gmail.com',
  );
  await page.getByRole('link', { name: 'Delete account', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Delete your nico notes account', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Request deletion by email', exact: true }),
  ).toHaveAttribute('href', /mailto:nishit\.nagar1@gmail\.com\?subject=/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('public policies include provider links and Convex-only image handling', async ({ page }) => {
  await page.goto('/privacy');
  await expect(
    page.getByRole('link', { name: 'Google Privacy Policy', exact: true }).first(),
  ).toHaveAttribute('href', 'https://policies.google.com/privacy');
  await expect(
    page.getByText('Google-provided names, addresses, coordinates and attributions', {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Terms', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Terms and community rules', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Google Maps Additional Terms', exact: true }),
  ).toHaveAttribute('href', 'https://www.google.com/help/terms_maps/');
  await page.getByRole('link', { name: 'Help', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Help and support', exact: true })).toBeVisible();
  await expect(
    page.getByText('Profile and visit images are stored in Convex.', { exact: false }),
  ).toBeVisible();
});
