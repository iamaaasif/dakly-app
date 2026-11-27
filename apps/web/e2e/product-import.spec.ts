import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

const csv = [
  'Product Name,Selling Price,Brand,SKU,Stock,Size',
  'Cotton kurti,1200,Nakshi,KURTI-M,12,M',
  'Silk scarf,450,,SCARF-1,20,Free',
  'Leather belt,900,,BELT-1,5,M',
  'Woven cap,abc,,CAP-1,3,M',
].join('\r\n');
const names = ['Cotton kurti', 'Silk scarf', 'Leather belt', 'Woven cap'];

test('imports products from a CSV, sets stock through the ledger and reports the bad row', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const [storeId] = fixture.storeIds;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const evidence = resolve(process.cwd(), 'e2e-artifacts/prod-5-import');
  await mkdir(evidence, { recursive: true });
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  async function capture(name: string) {
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      if (name === 'dry-run' && width === 360)
        await page.getByLabel('Brand, row 2').scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(evidence, `${name}-${width}x${height}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  try {
    const current = await context.request.get('/api/me/context');
    const { contextTag } = await current.json();
    const headers = { Origin: baseURL!, 'X-Session-Context': contextTag };
    expect(
      (await context.request.post('/api/me/active-store', { data: { storeId }, headers })).status(),
    ).toBe(204);
    const seeded = await context.request.post('/api/products', {
      data: {
        name: 'Cotton kurti',
        pricePoisha: 100000,
        options: [{ name: 'Size', values: ['M'] }],
        variants: [{ sku: 'KURTI-M', optionValues: { Size: 'M' } }],
      },
      headers,
    });
    expect(seeded.status()).toBe(201);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/products');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Import products' })).toBeVisible();
    await capture('upload');
    await page.getByLabel('Product file').setInputFiles({
      name: 'products.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });
    await expect(page.getByRole('status')).toContainText('4 rows · 6 columns');
    await capture('upload-detected');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByLabel('Product name')).toHaveValue('0');
    await expect(page.getByLabel('Brand', { exact: true })).toHaveValue('2');
    await expect(page.getByLabel('Option name')).toHaveValue('Size');
    await capture('map');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByLabel('Product name, row 5')).toHaveValue('Woven cap');
    await expect(page.getByLabel('Brand, row 2')).toHaveValue('Nakshi');
    await expect(page.getByRole('button', { name: 'Download error report' })).toBeVisible();
    await capture('dry-run');
    await page.getByRole('button', { name: /Confirm and import/ }).click();

    await expect(page.getByText('Import finished.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Added').locator('xpath=following-sibling::dd')).toHaveText('2');
    await expect(page.getByText('Updated').locator('xpath=following-sibling::dd')).toHaveText('1');
    await expect(page.getByText('Failed').locator('xpath=following-sibling::dd')).toHaveText('1');
    await expect(page.getByRole('link', { name: 'Download the error report' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Undo/ })).toHaveCount(0);
    await capture('result');

    const { rows } = await database.pool.query<{ sku: string; onHand: number }>(
      'select sku, on_hand as "onHand" from product_variants where store_id=$1 and sku=any($2::text[]) order by sku',
      [storeId, ['BELT-1', 'KURTI-M', 'SCARF-1']],
    );
    expect(rows).toEqual([
      { sku: 'BELT-1', onHand: 5 },
      { sku: 'KURTI-M', onHand: 12 },
      { sku: 'SCARF-1', onHand: 20 },
    ]);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('table').getByText('Leather belt')).toBeVisible();
  } finally {
    try {
      const { rows } = await database.pool.query<{ id: string }>(
        'select id from products where store_id=$1 and name=any($2::text[])',
        [storeId, names],
      );
      const ids = rows.map((row) => row.id);
      const variants = (
        await database.pool.query<{ id: string }>(
          'select id from product_variants where store_id=$1 and product_id=any($2::uuid[])',
          [storeId, ids],
        )
      ).rows.map((row) => row.id);
      await database.pool.query(
        "delete from outbox_events where store_id=$1 and (payload->>'productId'=any($2::text[]) or payload->>'variantId'=any($3::text[]) or type='product_import.started')",
        [storeId, ids, variants],
      );
      await database.pool.query(
        'delete from stock_movements where store_id=$1 and variant_id=any($2::uuid[])',
        [storeId, variants],
      );
      await database.pool.query(
        'delete from product_variants where store_id=$1 and id=any($2::uuid[])',
        [storeId, variants],
      );
      await database.pool.query('delete from products where store_id=$1 and id=any($2::uuid[])', [
        storeId,
        ids,
      ]);
      await database.pool.query('delete from product_brands where store_id=$1 and name=$2', [
        storeId,
        'Nakshi',
      ]);
      await database.pool.query("delete from imports where store_id=$1 and kind='products_csv'", [
        storeId,
      ]);
      await database.pool.query("delete from files where store_id=$1 and purpose='import'", [
        storeId,
      ]);
    } finally {
      await database.pool.end();
    }
  }
});
