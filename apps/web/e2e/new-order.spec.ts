import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

const evidence = resolve(process.cwd(), '../../docs/design/evidence/ord-5-new-order');

async function capture(page: Page, name: string) {
  await mkdir(evidence, { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.mouse.move(width - 1, height - 1);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    if (name === 'new') {
      await expect
        .poll(() =>
          page
            .locator('dialog[open]')
            .evaluate((dialog) => dialog.scrollWidth - dialog.clientWidth),
        )
        .toBe(0);
    }
    await page.screenshot({
      path: resolve(evidence, `${name}-${width}.png`),
      animations: 'disabled',
    });
  }
}

test('creates and confirms a staff order with a separate recipient', async ({
  page,
  context,
  baseURL,
}) => {
  page.setDefaultTimeout(8000);
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as { token: string; storeIds: string[] };
  const storeId = fixture.storeIds[0]!;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const productId = randomUUID();
  const variantId = randomUUID();
  const zoneId = randomUUID();
  let insertedCounter = false;
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  try {
    const current = await context.request.get('/api/me/context');
    const { contextTag } = await current.json();
    const selected = await context.request.post('/api/me/active-store', {
      data: { storeId },
      headers: { Origin: baseURL!, 'X-Session-Context': contextTag },
    });
    expect(selected.status()).toBe(204);
    const counter = await database.pool.query(
      'insert into store_counters (store_id) values ($1) on conflict do nothing returning store_id',
      [storeId],
    );
    insertedCounter = counter.rowCount === 1;
    await database.pool.query(
      "insert into products (id,store_id,name,price_poisha) values ($1,$2,'Cotton Panjabi',125000)",
      [productId, storeId],
    );
    await database.pool.query(
      "insert into product_variants (id,store_id,product_id,title,on_hand) values ($1,$2,$3,'M',5)",
      [variantId, storeId, productId],
    );
    await database.pool.query(
      "insert into delivery_zones (id,store_id,name,charge_poisha,bd_area_ids) values ($1,$2,'Inside Dhaka',6000,ARRAY[301])",
      [zoneId, storeId],
    );
    await page.goto('/orders');
    await expect(page.getByRole('button', { name: 'New order' })).toBeVisible();
    await capture(page, 'pipeline');
    await page.getByRole('button', { name: 'New order' }).click();
    const create = page.getByRole('dialog', { name: 'New order' });
    await create.getByLabel('Buyer name').fill('Rahim Ahmed');
    await create.getByLabel('Deliver to someone else').check();
    await create.getByLabel('Recipient name').fill('Karim Ahmed');
    await create.getByLabel('Recipient phone').fill('01701000015');
    await create.getByLabel('Address').fill('House 14, Mirpur');
    await create.getByLabel('Division').selectOption({ label: 'Dhaka' });
    await create.getByLabel('District').selectOption({ label: 'Dhaka' });
    await expect(create.getByLabel('Delivery charge (৳)')).toHaveAttribute('placeholder', '60');
    await create.getByLabel('Product and variant 1').selectOption({ label: 'Cotton Panjabi · M' });
    await create.getByLabel('Advance paid (৳)').fill('200');
    await expect(create.getByText('৳1,110')).toBeVisible();
    await capture(page, 'new');
    await create.getByRole('button', { name: 'Save as confirmed' }).click();
    const detail = page.getByRole('dialog', { name: /^Order #/ });
    await expect(detail.getByText('Karim Ahmed', { exact: true })).toBeVisible();
    await expect(detail.getByText('Buyer Rahim Ahmed')).toBeVisible();
    await expect(detail.getByText('To confirm → To pack')).toBeVisible();
  } finally {
    const orders = await database.pool.query<{ id: string }>(
      'select id from orders where store_id=$1 and delivery_zone_id=$2',
      [storeId, zoneId],
    );
    const ids = orders.rows.map((order) => order.id);
    await database.pool.query(
      "delete from outbox_events where store_id=$1 and (payload->>'orderId' = any($2::text[]) or payload->>'variantId'=$3)",
      [storeId, ids, variantId],
    );
    await database.pool.query('delete from orders where store_id=$1 and id=any($2::uuid[])', [
      storeId,
      ids,
    ]);
    await database.pool.query('delete from stock_movements where store_id=$1 and variant_id=$2', [
      storeId,
      variantId,
    ]);
    await database.pool.query('delete from product_variants where store_id=$1 and id=$2', [
      storeId,
      variantId,
    ]);
    await database.pool.query('delete from products where store_id=$1 and id=$2', [
      storeId,
      productId,
    ]);
    await database.pool.query('delete from delivery_zones where store_id=$1 and id=$2', [
      storeId,
      zoneId,
    ]);
    if (insertedCounter)
      await database.pool.query('delete from store_counters where store_id=$1', [storeId]);
    await database.pool.end();
  }
});
