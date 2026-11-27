import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

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
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const storeId = fixture.storeIds[0];
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

  try {
    await page.goto('/products/new');
    await page.getByLabel('Title', { exact: true }).fill('Eid panjabi');
    await page.getByLabel('Regular price', { exact: true }).fill('1800');

    const description = page.getByLabel('Description', { exact: true });
    await description.fill('Soft cotton\nSide pockets');
    await description.press('Control+A');
    await page.getByRole('button', { name: 'Bullet list' }).click();
    await expect(description).toHaveValue('• Soft cotton\n• Side pockets');

    await page.getByRole('button', { name: 'Add short description' }).click();
    await page.getByLabel('Short description').fill('Eid special, ready to ship');
    await page.getByLabel('Barcode').fill('8901234567890');
    await capture('details', () => description.scrollIntoViewIfNeeded());

    await page.getByRole('button', { name: 'Add tags' }).click();
    await page.getByLabel('Search or add tags').fill('eid');
    await page.getByLabel('Search or add tags').press('Enter');
    await page.getByLabel('Search or add tags').fill('panjabi');
    await page.getByLabel('Search or add tags').press('Enter');
    await capture('tags-panel', () =>
      page.getByLabel('Search or add tags').scrollIntoViewIfNeeded(),
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Remove eid' })).toBeVisible();
    await page.getByRole('button', { name: 'Add collections' }).click();
    await page.getByLabel('Search or add collections').fill('Eid 2026');
    await page.getByLabel('Search or add collections').press('Enter');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Remove Eid 2026' })).toBeVisible();

    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/);
    await page.reload();
    await expect(page.getByLabel('Short description')).toHaveValue('Eid special, ready to ship');
    await expect(page.getByLabel('Barcode')).toHaveValue('8901234567890');
    await expect(page.getByRole('button', { name: 'Remove panjabi' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Eid 2026' })).toBeVisible();
  } finally {
    try {
      const products = await database.pool.query<{ id: string }>(
        'select id from products where store_id=$1 and name=$2',
        [storeId, 'Eid panjabi'],
      );
      const productIds = products.rows.map((row) => row.id);
      const variants = await database.pool.query<{ id: string }>(
        'select id from product_variants where store_id=$1 and product_id=any($2::uuid[])',
        [storeId, productIds],
      );
      const variantIds = variants.rows.map((row) => row.id);
      const sql: [string, unknown[]][] = [
        [
          "delete from outbox_events where store_id=$1 and (payload->>'productId'=any($2::text[]) or payload->>'variantId'=any($3::text[]))",
          [storeId, productIds, variantIds],
        ],
        [
          'delete from stock_movements where store_id=$1 and variant_id=any($2::uuid[])',
          [storeId, variantIds],
        ],
        [
          'delete from product_tag_links where store_id=$1 and product_id=any($2::uuid[])',
          [storeId, productIds],
        ],
        [
          'delete from product_collection_links where store_id=$1 and product_id=any($2::uuid[])',
          [storeId, productIds],
        ],
        [
          'delete from product_variants where store_id=$1 and product_id=any($2::uuid[])',
          [storeId, productIds],
        ],
        ['delete from products where store_id=$1 and id=any($2::uuid[])', [storeId, productIds]],
        [
          'delete from product_tags where store_id=$1 and lower(name)=any($2::text[])',
          [storeId, ['eid', 'panjabi']],
        ],
        ['delete from product_collections where store_id=$1 and name=$2', [storeId, 'Eid 2026']],
      ];
      for (const [text, values] of sql) await database.pool.query(text, values);
    } finally {
      await database.pool.end();
    }
  }
});
