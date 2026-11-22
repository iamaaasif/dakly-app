import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import type { ProductResponse } from '@dakly/contracts/products';
import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('adds a product on a full page and keeps Save in the top bar', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const evidence = resolve(process.cwd(), '../../docs/design/evidence/prod-11-page');
  const name = 'Cotton shirt page fixture';
  let productId: string | undefined;
  // CI keeps only e2e-artifacts, so each screenshot is also written there.
  const ciCopy = resolve(process.cwd(), 'e2e-artifacts/prod-11-page');
  await mkdir(evidence, { recursive: true });
  await mkdir(ciCopy, { recursive: true });
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  async function capture(screen: string) {
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.mouse.move(width - 1, height - 1);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      for (const directory of [evidence, ciCopy])
        await page.screenshot({ path: resolve(directory, `${screen}-${width}.png`) });
    }
  }
  try {
    const session = await (await context.request.get('/api/me/context')).json();
    const activated = await context.request.fetch('/api/me/active-store', {
      method: 'POST',
      data: { storeId: fixture.storeIds[0] },
      headers: { Origin: baseURL!, 'X-Session-Context': session.contextTag },
    });
    expect(activated.status()).toBe(204);

    await page.goto('/products');
    await page.getByRole('button', { name: 'Add product', exact: true }).click();
    await expect(page).toHaveURL(/\/products\/new$/);
    await expect(page.getByRole('heading', { name: 'New product', exact: true })).toBeVisible();
    await expect(page.getByText('Save the product to add photos.')).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill(name);
    await capture('new');

    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/products') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
    );
    await page.getByRole('button', { name: 'Save as hidden', exact: true }).click();
    productId = ((await (await created).json()) as ProductResponse).id;
    await expect(page).toHaveURL(new RegExp(`/products/${productId}$`));
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Photos', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show product', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save product', exact: true })).toBeDisabled();
    await capture('saved');
  } finally {
    try {
      if (productId) {
        const store = fixture.storeIds[0];
        await database.pool.query(
          "delete from outbox_events where store_id=$1 and payload->>'productId'=$2",
          [store, productId],
        );
        await database.pool.query(
          'delete from product_variants where store_id=$1 and product_id=$2',
          [store, productId],
        );
        await database.pool.query('delete from products where store_id=$1 and id=$2', [
          store,
          productId,
        ]);
      }
    } finally {
      await database.pool.end();
    }
  }
});
