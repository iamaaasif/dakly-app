import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('filters the active shop’s pipeline by alert, search and stage', async ({
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
        recipient_phone,recipient_address,recipient_district,on_hold_reason,items_subtotal_poisha,
        delivery_charge_poisha,cod_amount_poisha,created_at)
        values ($1,$2,$3,'manual','user',$4,$5,$5,$6,'House 14, Mirpur','Dhaka',case when $4='on_hold' then 'pre_order' end,$7,6000,$8,
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
      if (name === 'pipeline' && width === 360) {
        const action = page.getByRole('link', { name: 'Confirm order #1060' });
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeInViewport({ ratio: 1 });
      }
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
      cod: 501000,
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
    await order({
      number: 1056,
      stage: 'delivered',
      name: 'Nusrat Jahan',
      phone: '01701000002',
      hours: 49,
      cod: 322000,
    });
    const partial = await order({
      number: 1055,
      stage: 'partially_delivered',
      name: 'Nusrat Jahan',
      phone: '01701000002',
      hours: 71,
      cod: 256000,
    });
    await order({
      number: 1054,
      stage: 'on_hold',
      name: 'Imran Khan',
      phone: '01701000003',
      hours: 4,
      cod: 98000,
    });
    await database.pool.query(
      'update orders set items_subtotal_poisha=450000, delivered_items_subtotal_poisha=252000, delivered_order_discount_poisha=2000 where id=$1',
      [partial],
    );
    await database.pool.query(
      `insert into order_items (id,store_id,order_id,variant_id,product_name,variant_title,quantity,unit_price_poisha,line_discount_poisha,is_stock_tracked)
        values ($1,$2,$3,$4,'Cotton Panjabi','L',2,248000,1000,false)`,
      [randomUUID(), storeId, kamal, variantId],
    );

    await page.goto('/orders?stage=to_confirm');
    await expect(page.getByText('Kamal Hossain', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Order stages' }).getByRole('link'),
    ).toHaveCount(5);
    await expect(page.getByRole('link', { name: 'To confirm 3' })).toBeVisible();
    await expect(page.getByText('On hold', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Confirm order #1054' })).toBeVisible();
    await expect(page.getByText('3 hours ago', { exact: true })).toHaveAttribute(
      'title',
      /Asia\/Dhaka/,
    );
    await expect(page.getByText('1 order waiting over 12 hours')).toBeVisible();
    await expect(page.getByText('1 high-risk order')).toBeVisible();
    await expect(page.getByText('৳5,780 COD still with couriers')).toBeVisible();
    await expect(page.getByText('Cotton Panjabi (L) × 2')).toBeVisible();
    await capture('pipeline');

    await page.getByRole('link', { name: '1 high-risk order' }).click();
    await expect(page).toHaveURL(/alert=risk/);
    await expect(page.getByText('Nusrat Jahan', { exact: true })).toHaveCount(0);
    await page.getByRole('searchbox').fill('#1060');
    await page.getByRole('searchbox').press('Enter');
    await expect(page).toHaveURL(/search=%231060/);
    await expect(page.getByText('Nusrat Jahan', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Kamal Hossain', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Confirm order #1060' }).click();
    const detail = page.getByRole('dialog', { name: 'Order #1060' });
    await expect(detail.getByText('Staff ·')).toBeVisible();
    await expect(detail.getByText('3 hours ago')).toHaveAttribute('title', /Asia\/Dhaka/);
    await expect(detail.getByText('High return risk')).toBeVisible();
    await expect(detail.getByText('Ask for a small advance first')).toBeVisible();
    await expect(detail.getByText('Line discount')).toBeVisible();
    await verifyDrawerWhileSessionIsBlocked(page, detail);
    const confirm = detail.getByRole('button', { name: 'Mark confirmed' });
    await capture('detail');
    await expect(confirm).toBeInViewport({ ratio: 1 });
    const content = detail.getByRole('region', { name: 'Order #1060 content' });
    await detail.getByRole('button', { name: 'Close' }).focus();
    await page.keyboard.press('Tab');
    await expect(content).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(confirm).toBeFocused();
    await confirm.press('Enter');
    await expect(detail.getByText('To confirm → To pack')).toBeVisible();
    await expect(detail.getByRole('status', { name: 'Order stage' })).toBeFocused();
    await detail.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeFocused();
    await page.getByRole('link', { name: /^To pack/ }).click();
    await expect(page).toHaveURL(/stage=to_pack/);
    await expect(page.getByRole('link', { name: 'Kamal Hossain' })).toBeVisible();
    await page.getByRole('link', { name: 'Clear search' }).click();
    await page.getByRole('link', { name: /^Delivered/ }).click();
    await expect(page).toHaveURL(/stage=delivered/);
    await expect(page.getByText('Nusrat Jahan', { exact: true })).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Delivered 2' })).toBeVisible();
    await expect(page.getByText('Partly delivered', { exact: true })).toBeVisible();
    await expect(page.getByText('৳2,560', { exact: true })).toBeVisible();
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

async function verifyDrawerWhileSessionIsBlocked(page: Page, detail: Locator) {
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route('**/api/me/context', async (route) => {
    entered();
    await held;
    await route.continue();
  });
  try {
    const verified = page.waitForResponse((response) => response.url().endsWith('/api/me/context'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await requested;
    await expect(detail).toBeHidden();
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible();
    release();
    expect((await verified).status()).toBe(200);
    await expect(detail).toBeVisible();
  } finally {
    release();
    await page.unroute('**/api/me/context');
  }
}
