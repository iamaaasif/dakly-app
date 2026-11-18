import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('filters orders, opens a detail and confirms an order in the active shop', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as { token: string; storeIds: string[] };
  const storeId = fixture.storeIds[0]!;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const evidence = resolve(process.cwd(), '../../docs/design/evidence/ord-5-pipeline');
  const orderIds: string[] = [];
  const productId = randomUUID();
  const variantId = randomUUID();
  await mkdir(evidence, { recursive: true });
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);

  async function order({
    number,
    stage,
    name,
    phone,
    hours,
    cod,
  }: {
    number: number;
    stage: string;
    name: string;
    phone: string;
    hours: number;
    cod: number;
  }) {
    const id = randomUUID();
    orderIds.push(id);
    await database.pool.query(
      `insert into orders (id,store_id,number,source,created_by_type,stage,buyer_name,recipient_name,
        recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,
        delivery_charge_poisha,cod_amount_poisha,created_at)
        values ($1,$2,$3,'manual','user',$4,$5,$5,$6,'House 14, Mirpur','Dhaka',$7,6000,$8,
          now() - ($9::int * interval '1 hour'))`,
      [id, storeId, number, stage, name, phone, cod - 6000, cod, hours],
    );
    return id;
  }

  async function capture(name: string) {
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.mouse.move(width - 1, height - 1);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
      await page.screenshot({
        path: resolve(evidence, `${name}-${width}.png`),
        animations: 'disabled',
      });
    }
  }

  try {
    const current = await context.request.get('/api/me/context');
    const { contextTag } = await current.json();
    const selected = await context.request.post('/api/me/active-store', {
      data: { storeId },
      headers: { Origin: baseURL!, 'X-Session-Context': contextTag },
    });
    expect(selected.status()).toBe(204);
    await database.pool.query(
      "insert into products (id,store_id,name,price_poisha,is_stock_tracked) values ($1,$2,'Cotton Panjabi',248000,false)",
      [productId, storeId],
    );
    await database.pool.query(
      "insert into product_variants (id,store_id,product_id,title) values ($1,$2,$3,'L')",
      [variantId, storeId, productId],
    );
    const kamal = await order({
      number: 1060,
      stage: 'to_confirm',
      name: 'Kamal Hossain',
      phone: '01701000001',
      hours: 3,
      cod: 502000,
    });
    await order({
      number: 1059,
      stage: 'to_confirm',
      name: 'Nusrat Jahan',
      phone: '01701000002',
      hours: 14,
      cod: 226000,
    });
    await order({
      number: 1058,
      stage: 'returned',
      name: 'Kamal Hossain',
      phone: '01701000001',
      hours: 52,
      cod: 248000,
    });
    await order({
      number: 1057,
      stage: 'returned',
      name: 'Kamal Hossain',
      phone: '01701000001',
      hours: 72,
      cod: 248000,
    });
    const delivered = await order({
      number: 1056,
      stage: 'delivered',
      name: 'Nusrat Jahan',
      phone: '01701000002',
      hours: 49,
      cod: 322000,
    });
    await order({
      number: 1055,
      stage: 'delivered',
      name: 'Nusrat Jahan',
      phone: '01701000002',
      hours: 71,
      cod: 256000,
    });
    await database.pool.query(
      "update orders set courier='pathao', source='whatsapp', created_at='2026-11-16T18:00:00Z' where store_id=$1 and id=$2",
      [storeId, delivered],
    );
    await database.pool.query(
      `insert into order_items (id,store_id,order_id,variant_id,product_name,variant_title,quantity,unit_price_poisha,is_stock_tracked)
        values ($1,$2,$3,$4,'Cotton Panjabi','L',2,248000,false)`,
      [randomUUID(), storeId, kamal, variantId],
    );

    await page.goto('/orders?stage=to_confirm');
    await expect(page.getByRole('link', { name: 'Kamal Hossain' })).toBeVisible();
    await expect(page.getByText('1 order waiting over 12 hours')).toBeVisible();
    await expect(page.getByText('1 high-risk order')).toBeVisible();
    await expect(page.getByText('৳5,780 COD still with couriers')).toBeVisible();
    await expect(page.getByText('Cotton Panjabi (L) × 2')).toBeVisible();
    await capture('pipeline');

    await page.getByRole('link', { name: '1 high-risk order' }).click();
    await expect(page).toHaveURL(/alert=risk/);
    await expect(page.getByRole('link', { name: 'Nusrat Jahan' })).toHaveCount(0);
    await page.getByRole('searchbox').fill('#1060');
    await page.getByRole('button', { name: 'Search orders' }).click();
    await expect(page).toHaveURL(/search=%231060/);
    await expect(page.getByRole('link', { name: 'Nusrat Jahan' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Confirm order #1060' }).click();
    const detail = page.getByRole('dialog', { name: 'Order #1060' });
    await expect(detail.getByText('High return risk')).toBeVisible();
    await detail.getByRole('button', { name: 'Mark confirmed' }).click();
    await expect(detail.getByText('To confirm → To pack')).toBeVisible();
    await capture('detail');
    await detail.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('link', { name: /^To pack/ }).click();
    await expect(page).toHaveURL(/stage=to_pack/);
    await expect(page.getByRole('link', { name: 'Kamal Hossain' })).toBeVisible();
    await page.getByRole('link', { name: 'Clear search' }).click();
    await page.getByRole('link', { name: /^Delivered/ }).click();
    await expect(page.getByRole('link', { name: 'Nusrat Jahan' })).toHaveCount(2);
    await page.getByText('Filters', { exact: true }).click();
    await page.getByRole('combobox', { name: 'Source' }).selectOption('whatsapp');
    await page.getByRole('combobox', { name: 'Courier' }).selectOption('pathao');
    await page.getByLabel('From date').fill('2026-11-17');
    await page.getByLabel('Through date').fill('2026-11-17');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/courier=pathao/);
    await expect(page.getByRole('link', { name: 'Nusrat Jahan' })).toHaveCount(1);
    await capture('filters');
  } finally {
    await database.pool.query(
      "delete from outbox_events where store_id=$1 and payload->>'orderId' = any($2::text[])",
      [storeId, orderIds],
    );
    await database.pool.query('delete from orders where store_id=$1 and id=any($2::uuid[])', [
      storeId,
      orderIds,
    ]);
    await database.pool.query('delete from product_variants where store_id=$1 and id=$2', [
      storeId,
      variantId,
    ]);
    await database.pool.query('delete from products where store_id=$1 and id=$2', [
      storeId,
      productId,
    ]);
    await database.pool.end();
  }
});
