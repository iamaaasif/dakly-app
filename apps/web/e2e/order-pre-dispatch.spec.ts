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

test('holds an order, returns it to confirmation and cancels from the drawer', async ({
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
        values ($1,$2,1050,'manual','user','to_confirm','Karim Ahmed','Karim Ahmed',
          '01701000015','House 14, Mirpur','Dhaka',250000,6000,256000,now() - interval '3 hours')`,
      [orderId, storeId],
    );
    await database.pool.query(
      `insert into order_items (id,store_id,order_id,variant_id,product_name,variant_title,quantity,
        unit_price_poisha,is_stock_tracked)
        values ($1,$2,$3,$4,'Cotton Panjabi','M',2,125000,true)`,
      [randomUUID(), storeId, orderId, variantId],
    );

    await page.goto('/orders?stage=to_confirm');
    await page.getByRole('link', { name: 'Confirm order #1050' }).click();
    const detail = page.getByRole('dialog', { name: 'Order #1050' });
    const stage = detail.getByRole('status', { name: 'Order stage' });
    await expect(stage).toHaveText('To confirm');
    await capture(page, 'detail');

    await detail.getByRole('button', { name: 'Put on hold' }).click();
    const hold = page.getByRole('dialog', { name: 'Put on hold' });
    await expect(page.locator('[role="dialog"]').filter({ hasText: 'Order #1050' })).toHaveCount(1);
    await hold.getByRole('button', { name: 'Put on hold' }).click();
    await expect(hold.getByText('Choose a reason.', { exact: true })).toBeVisible();
    await hold.getByLabel('Reason').selectOption({ label: 'Pre-order' });
    await capture(page, 'hold');
    const detailApi = '**/api/orders/' + orderId;
    await page.route(detailApi, (route) => route.abort());
    await hold.getByRole('button', { name: 'Put on hold' }).click();
    await expect(detail.getByText('To confirm → On hold')).toBeVisible();
    await expect(detail.getByText('Pre-order')).toBeVisible();
    await expect(stage).toBeFocused();
    await page.unroute(detailApi);
    await detail.getByRole('button', { name: 'Back to confirmation' }).click();
    await expect(detail.getByText('On hold → To confirm')).toBeVisible();

    const cancelButton = detail.getByRole('button', { name: 'Cancel order' });
    await cancelButton.click();
    const cancel = page.getByRole('dialog', { name: 'Cancel order #1050?' });
    await cancel.getByLabel('Reason').selectOption({ label: 'Customer cancelled' });
    await capture(page, 'cancel');
    await cancel.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(cancelButton).toBeFocused();
    await cancelButton.click();
    await expect(cancel.getByLabel('Reason')).toHaveValue('');
    await cancel.getByLabel('Reason').selectOption({ label: 'Customer cancelled' });
    const listApi = '**/api/orders?*';
    const refresh = Promise.withResolvers<void>();
    await page.route(listApi, async (route) => {
      await refresh.promise;
      await route.continue();
    });
    try {
      const refreshRequest = page.waitForRequest(listApi);
      await cancel.getByRole('button', { name: 'Cancel order' }).click();
      await expect(stage).toHaveText('Cancelled');
      await expect(stage).toBeFocused();
      await refreshRequest;
      const rowAction = page.locator(`[data-order-row-action="${orderId}"]`);
      await expect(rowAction).toHaveCount(1);
      await detail.getByRole('button', { name: 'Close', exact: true }).click();
      const heading = page.getByRole('heading', { name: 'Orders', exact: true });
      await expect(heading).toBeFocused();
      refresh.resolve();
      await expect(rowAction).toHaveCount(0);
      await expect(heading).toBeFocused();
    } finally {
      refresh.resolve();
      await page.unroute(listApi);
    }
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
