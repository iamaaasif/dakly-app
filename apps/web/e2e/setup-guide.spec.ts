import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

test.use({ screenshot: 'off' });

test('asks how the shop sells, then shows the steps that fit', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  expect(
    (
      await context.request.post('/api/me/active-store', {
        data: { storeId: fixture.storeIds[0] },
        headers: { Origin: baseURL! },
      })
    ).status(),
  ).toBe(204);
  const evidence = resolve(process.cwd(), '../../docs/design/evidence/acc-13-setup-checklist');
  await mkdir(evidence, { recursive: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');
  const banner = page.getByRole('heading', { name: 'How do you sell?', level: 2 });
  await expect(banner).toBeVisible();
  const card = page.getByRole('region', { name: 'Get started with Dakly' });
  await expect(card.getByText('0 of 2 done')).toBeVisible();
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({
      path: resolve(evidence, `banner-and-card-${width}.png`),
      fullPage: width < 800,
    });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Set up Dakly' }).click();
  const dialog = page.getByRole('dialog', { name: 'How do you sell?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Facebook or social media/ }).click();
  await page.screenshot({ path: resolve(evidence, 'how-you-sell-1440.png') });
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('heading', { name: 'How do you sell?', level: 2 })).toHaveCount(0);
  await expect(card.getByText('0 of 6 done')).toBeVisible();
  await expect(card.getByRole('heading', { name: 'Connect your Facebook Page' })).toBeVisible();
  await expect(card.getByRole('link', { name: 'Connect page' })).toBeVisible();
  // Earlier specs may already have turned some extensions on for this shop, so only the lead-in is fixed.
  await expect(page.getByText(/^Dakly is set up for how you sell\./)).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click();
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({
      path: resolve(evidence, `six-steps-${width}.png`),
      fullPage: width < 800,
    });
  }
});
