import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

test.use({ screenshot: 'off' });

test('adds a short description, tags, a barcode and a bulleted description, then saves', async ({
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
  const evidence = resolve(process.cwd(), '../../docs/design/evidence/dsn-7');
  const ciCopy = resolve(process.cwd(), 'e2e-artifacts/dsn-7');
  await mkdir(evidence, { recursive: true });
  await mkdir(ciCopy, { recursive: true });
  async function capture(screen: string, focus: () => Promise<void>) {
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await focus();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      for (const directory of [evidence, ciCopy])
        await page.screenshot({ path: resolve(directory, `${screen}-${width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  const session = await (await context.request.get('/api/me/context')).json();
  const activated = await context.request.fetch('/api/me/active-store', {
    method: 'POST',
    data: { storeId: fixture.storeIds[0] },
    headers: { Origin: baseURL!, 'X-Session-Context': session.contextTag },
  });
  expect(activated.status()).toBe(204);

  await page.goto('/products/new');
  await page.getByLabel('Title', { exact: true }).fill('Eid panjabi');
  await page.getByLabel('Regular price', { exact: true }).fill('1800');

  const description = page.getByLabel('Description', { exact: true });
  await description.fill('Soft cotton\nSide pockets');
  await description.press('Control+A');
  await page.getByRole('button', { name: 'Bullet list' }).click();
  await expect(description).toHaveValue('• Soft cotton\n• Side pockets');

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Short description').fill('Eid special, ready to ship');
  await page.getByLabel('Barcode').fill('8901234567890');
  await capture('details', () => description.scrollIntoViewIfNeeded());

  await page.getByRole('button', { name: 'Add tags' }).click();
  await page.getByLabel('Search or add tags').fill('eid');
  await page.getByLabel('Search or add tags').press('Enter');
  await page.getByLabel('Search or add tags').fill('panjabi');
  await page.getByLabel('Search or add tags').press('Enter');
  await capture('tags-panel', () => page.getByLabel('Search or add tags').scrollIntoViewIfNeeded());
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Remove eid' })).toBeVisible();

  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/products(\/|\?|$)/);
  await page
    .getByRole('link', { name: /Eid panjabi/ })
    .first()
    .click();
  await expect(page.getByLabel('Short description')).toHaveValue('Eid special, ready to ship');
  await expect(page.getByLabel('Barcode')).toHaveValue('8901234567890');
  await expect(page.getByRole('button', { name: 'Remove panjabi' })).toBeVisible();
});
