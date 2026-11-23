import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import type { ProductResponse } from '@dakly/contracts/products';
import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('manages categories and brands, filters by them and bulk edits them', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const storeId = fixture.storeIds[0];
  const products: ProductResponse[] = [];
  const evidence = resolve(process.cwd(), '../../docs/design/evidence/prod-12-lists');
  // CI keeps only e2e-artifacts, so each screenshot is also written there.
  const ciCopy = resolve(process.cwd(), 'e2e-artifacts/prod-12-lists');
  await mkdir(evidence, { recursive: true });
  await mkdir(ciCopy, { recursive: true });
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  async function request(path: string, data: unknown, method = 'POST') {
    const current = await context.request.get('/api/me/context');
    const { contextTag } = await current.json();
    return context.request.fetch(`/api${path}`, {
      method,
      data,
      headers: { Origin: baseURL!, 'X-Session-Context': contextTag },
    });
  }
  async function create(path: string, data: unknown) {
    const response = await request(path, data);
    expect(response.status()).toBe(201);
    return (await response.json()) as { id: string };
  }
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
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  try {
    expect((await request('/me/active-store', { storeId })).status()).toBe(204);
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto('/products/lists');
    await expect(page.getByText('No categories yet.')).toBeVisible();
    await expect(page.getByText('No brands yet.')).toBeVisible();
    await capture('lists-empty');

    const men = await create('/products/categories', { name: 'Men' });
    await create('/products/categories', { name: 'Shirts', parentId: men.id });
    const accessories = await create('/products/categories', { name: 'Accessories' });
    const nokshi = await create('/products/brands', { name: 'Nokshi' });
    await create('/products/brands', { name: 'Aarong' });
    for (const input of [
      { name: 'Cotton Panjabi', categoryId: men.id, brandId: nokshi.id },
      { name: 'Silk scarf', categoryId: accessories.id, brandId: nokshi.id },
      { name: 'Leather sandal', categoryId: accessories.id },
    ]) {
      const response = await request('/products', {
        ...input,
        pricePoisha: 245000,
        isStockTracked: false,
      });
      expect(response.status()).toBe(201);
      products.push(await response.json());
    }

    await page.goto('/products/lists');
    await expect(page.getByLabel('Name of Accessories')).toBeVisible();
    // A name that exists already is refused with a message on the row.
    const row = page.getByRole('listitem').filter({ has: page.getByLabel('Name of Accessories') });
    await page.getByLabel('Name of Accessories').fill('Men');
    await row.getByRole('button', { name: 'Rename' }).click();
    await expect(row.getByRole('alert')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await capture('lists-in-use');

    await page.goto('/products');
    await expect(page.getByRole('table', { name: 'Products' })).toBeVisible();
    await page.getByLabel('Category').selectOption({ label: 'Men' });
    await expect(page.getByRole('table', { name: 'Products' }).getByRole('row')).toHaveCount(2);
    await capture('filters');

    await page.goto('/products');
    await page.getByLabel('Select all products on this page').check();
    await page.getByRole('button', { name: 'Edit in grid' }).click();
    await expect(page.getByRole('table', { name: 'Edit products in a grid' })).toBeVisible();
    await capture('bulk-edit');
  } finally {
    try {
      await request('/me/active-store', { storeId });
    } finally {
      const ids = products.map((product) => product.id);
      for (const table of ['product_variants']) {
        await database.pool.query(
          `delete from ${table} where store_id=$1 and product_id=any($2::uuid[])`,
          [storeId, ids],
        );
      }
      await database.pool.query('delete from products where store_id=$1 and id=any($2::uuid[])', [
        storeId,
        ids,
      ]);
      await database.pool.query('delete from product_categories where store_id=$1', [storeId]);
      await database.pool.query('delete from product_brands where store_id=$1', [storeId]);
      await database.pool.end();
    }
  }
});
