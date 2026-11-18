import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

const evidence = resolve(process.cwd(), '../../docs/design/evidence/ord-5-stages');

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
    await page.screenshot({
      path: resolve(evidence, `${name}-${width}.png`),
      animations: 'disabled',
    });
  }
}

test('records manual dispatch, a partly delivered parcel and the COD actually collected', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as { token: string; storeIds: string[] };
  const storeId = fixture.storeIds[0]!;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const orderId = randomUUID();
  const productId = randomUUID();
  const variantId = randomUUID();
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
      "insert into products (id,store_id,name,price_poisha,is_stock_tracked) values ($1,$2,'Cotton Panjabi',125000,true)",
      [productId, storeId],
    );
    await database.pool.query(
      "insert into product_variants (id,store_id,product_id,title,on_hand,reserved) values ($1,$2,$3,'M',5,2)",
      [variantId, storeId, productId],
    );
    await database.pool.query(
      `insert into orders (id,store_id,number,source,created_by_type,stage,buyer_name,recipient_name,
        recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,
        delivery_charge_poisha,cod_amount_poisha,created_at)
        values ($1,$2,1050,'manual','user','to_pack','Karim Ahmed','Karim Ahmed',
          '01701000015','House 14, Mirpur','Dhaka',250000,6000,256000,now() - interval '3 hours')`,
      [orderId, storeId],
    );
    await database.pool.query(
      `insert into order_items (id,store_id,order_id,variant_id,product_name,variant_title,quantity,
        unit_price_poisha,is_stock_tracked)
        values ($1,$2,$3,$4,'Cotton Panjabi','M',2,125000,true)`,
      [randomUUID(), storeId, orderId, variantId],
    );

    await page.goto(`/orders?stage=to_pack&selected=${orderId}`);
    const detail = page.getByRole('dialog', { name: 'Order #1050' });
    await expect(detail.getByRole('button', { name: 'Sent with courier' })).toBeVisible();
    await capture(page, 'detail');
    await detail.getByRole('button', { name: 'Put on hold' }).click();
    const hold = page.getByRole('dialog', { name: 'Put on hold' });
    await hold.getByLabel('Reason').selectOption({ label: 'Pre-order' });
    await capture(page, 'hold');
    await hold.getByRole('button', { name: 'Put on hold' }).click();
    await expect(detail.getByText('To pack → On hold')).toBeVisible();
    await expect(detail.getByText('Pre-order')).toBeVisible();
    await detail.getByRole('button', { name: 'Mark confirmed' }).click();
    await expect(detail.getByText('On hold → To pack')).toBeVisible();
    await detail.getByRole('button', { name: 'Cancel order' }).click();
    const cancel = page.getByRole('dialog', { name: 'Cancel order #1050?' });
    await cancel.getByLabel('Reason').selectOption({ label: 'Customer cancelled' });
    await capture(page, 'cancel');
    await cancel.getByRole('button', { name: 'Back' }).click();

    await detail.getByRole('button', { name: 'Sent with courier' }).click();
    const dispatch = page.getByRole('dialog', { name: 'Sent with courier' });
    await dispatch.getByLabel('Courier', { exact: true }).selectOption({ label: 'Other' });
    await dispatch.getByLabel('Courier name').fill('Neighbourhood delivery');
    await dispatch.getByLabel('Courier', { exact: true }).selectOption({ label: 'Pathao' });
    await expect(dispatch.getByLabel('Courier name')).toHaveCount(0);
    await dispatch.getByLabel('Tracking code (optional)').fill('PATH-1050');
    await capture(page, 'courier');
    await dispatch.getByRole('button', { name: 'Sent with courier' }).click();
    await expect(detail.getByText('Tracking code PATH-1050')).toBeVisible();
    await expect(detail.getByText('To pack → With courier')).toBeVisible();

    await detail.getByRole('button', { name: 'Partly delivered' }).click();
    const partial = page.getByRole('dialog', { name: 'Partly delivered' });
    await partial.getByLabel('Cotton Panjabi · M · delivered out of 2').fill('1');
    await partial.getByLabel('Delivery note').fill('One item was sent back');
    await capture(page, 'partial');
    await partial.getByRole('button', { name: 'Partly delivered' }).click();
    await expect(detail.getByText('With courier → Partly delivered')).toBeVisible();
    await expect(detail.getByText('One item was sent back')).toBeVisible();

    await detail.getByRole('button', { name: 'Record COD collected' }).click();
    const cod = page.getByRole('dialog', { name: 'Record COD collected' });
    await expect(cod.getByLabel('Amount collected (৳)')).toHaveValue('1310.00');
    await cod.getByLabel('Amount collected (৳)').fill('1200.50');
    await capture(page, 'cod');
    await cod.getByRole('button', { name: 'Record COD collected' }).click();
    await expect(detail.getByText('৳1,200.50')).toBeVisible();

    await detail.getByRole('button', { name: 'Mark returned' }).click();
    const returned = page.getByRole('dialog', { name: 'Mark returned' });
    await returned.getByLabel('Return reason').fill('Customer returned the parcel');
    await capture(page, 'return');
    await returned.getByRole('button', { name: 'Mark returned' }).click();
    await expect(detail.getByText('Partly delivered → Returned')).toBeVisible();
  } finally {
    await database.pool.query(
      "delete from outbox_events where store_id=$1 and (payload->>'orderId'=$2 or payload->>'variantId'=$3)",
      [storeId, orderId, variantId],
    );
    await database.pool.query('delete from orders where store_id=$1 and id=$2', [storeId, orderId]);
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
    await database.pool.end();
  }
});
