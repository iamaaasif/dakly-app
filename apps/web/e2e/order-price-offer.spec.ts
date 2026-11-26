import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test('shows the line discount and AI price offer in order history', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const [storeId] = fixture.storeIds;
  const [orderId, productId, variantId, itemId, auditId] = Array.from({ length: 5 }, () =>
    randomUUID(),
  );
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
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
    await database.pool.query(
      `insert into products (id,store_id,name,price_poisha,is_stock_tracked)
       values ($1,$2,'Cotton panjabi',120000,false)`,
      [productId, storeId],
    );
    await database.pool.query(
      `insert into product_variants (id,store_id,product_id,title) values ($1,$2,$3,'M')`,
      [variantId, storeId, productId],
    );
    await database.pool.query(
      `insert into orders (id,store_id,number,source,created_by_type,stage,buyer_name,recipient_name,
        recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,delivery_charge_poisha,cod_amount_poisha)
        values ($1,$2,1060,'messenger','ai','to_confirm','Nila','Nila',
          '01811223344','House 10, Mirpur','Dhaka',105000,6000,111000)`,
      [orderId, storeId],
    );
    await database.pool.query(
      `insert into order_items (id,store_id,order_id,variant_id,product_name,variant_title,quantity,
        unit_price_poisha,line_discount_poisha,is_stock_tracked)
        values ($1,$2,$3,$4,'Cotton panjabi','M',1,120000,15000,false)`,
      [itemId, storeId, orderId, variantId],
    );
    await database.pool.query(
      `insert into audit_log (id,store_id,actor_type,action,entity_type,entity_id,reason)
        values ($1,$2,'system','order.ai_price_offer','order',$3,'AI price offer')`,
      [auditId, storeId, orderId],
    );

    await page.goto(`/orders?stage=to_confirm&selected=${orderId}`);
    const detail = page.getByRole('dialog', { name: 'Order #1060' });
    const history = detail.getByRole('region', { name: 'Order history' });
    await expect(history.getByText('AI price offer', { exact: true })).toBeVisible();
    await expect(detail.getByText(/^Line discount .*150/)).toBeVisible();
    await expect(detail.getByText('৳1,110', { exact: true }).first()).toBeVisible();
    const directories = [
      resolve(process.cwd(), '../../docs/design/evidence/prod-17-6'),
      resolve(process.cwd(), 'e2e-artifacts/prod-17-6'),
    ];
    for (const directory of directories) await mkdir(directory, { recursive: true });
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await history.scrollIntoViewIfNeeded();
      await expect(history).toBeInViewport();
      for (const directory of directories)
        await page.screenshot({
          path: resolve(directory, `order-price-offer-${width}x${height}.png`),
        });
    }
  } finally {
    await database.pool.query('delete from audit_log where store_id=$1 and id=$2', [
      storeId,
      auditId,
    ]);
    await database.pool.query('delete from orders where store_id=$1 and id=$2', [storeId, orderId]);
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
