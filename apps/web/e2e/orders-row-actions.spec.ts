import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('marks a parcel delivered from its row and shows courier, returns and risk counts', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as { token: string; storeIds: string[] };
  const storeId = fixture.storeIds[0]!;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const evidence = resolve(process.cwd(), '../../docs/design/evidence/ord-11-row-actions');
  const orderIds: string[] = [];
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
  }: {
    number: number;
    stage: string;
    name: string;
    phone: string;
    hours: number;
  }) {
    const id = randomUUID();
    orderIds.push(id);
    await database.pool.query(
      `insert into orders (id,store_id,number,source,created_by_type,stage,buyer_name,recipient_name,
        recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,
        delivery_charge_poisha,cod_amount_poisha,created_at)
        values ($1,$2,$3,'messenger','user',$4,$5,$5,$6,'GEC Circle','Chattogram',144000,6000,150000,
          now() - ($7::int * interval '1 hour'))`,
      [id, storeId, number, stage, name, phone, hours],
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
        path: resolve(evidence, `${name}-${width}x${height}.png`),
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
    const tanvir = await order({
      number: 1056,
      stage: 'with_courier',
      name: 'Tanvir Hasan',
      phone: '01801000001',
      hours: 200,
    });
    await order({
      number: 1055,
      stage: 'with_courier',
      name: 'Shila Rani',
      phone: '01801000002',
      hours: 220,
    });
    const hasan = await order({
      number: 1051,
      stage: 'returned',
      name: 'Hasan Ali',
      phone: '01801000003',
      hours: 400,
    });
    await order({
      number: 1049,
      stage: 'returned',
      name: 'Hasan Ali',
      phone: '01801000003',
      hours: 500,
    });
    await order({
      number: 1048,
      stage: 'delivered',
      name: 'Hasan Ali',
      phone: '01801000003',
      hours: 600,
    });
    await order({
      number: 1047,
      stage: 'delivered',
      name: 'Tanvir Hasan',
      phone: '01801000001',
      hours: 700,
    });
    await database.pool.query("update orders set courier='steadfast' where store_id=$1 and id=$2", [
      storeId,
      tanvir,
    ]);
    await database.pool.query(
      "update orders set courier='pathao' where store_id=$1 and number=1055 and id=any($2::uuid[])",
      [storeId, orderIds],
    );
    await database.pool.query(
      `update orders set courier='redx', return_reason='Refused at the door',
        returned_at='2026-11-06T06:00:00Z' where store_id=$1 and id=$2`,
      [storeId, hasan],
    );

    await page.goto('/orders?stage=with_courier');
    await expect(page.locator('ul').getByText('Steadfast', { exact: true })).toBeVisible();
    await expect(page.locator('ul').getByText('Pathao', { exact: true })).toBeVisible();
    await capture('with-courier');

    await page.getByRole('link', { name: 'Tanvir Hasan' }).click();
    const detail = page.getByRole('dialog', { name: 'Order #1056' });
    await expect(detail.getByText('Courier Steadfast')).toBeVisible();
    await capture('with-courier-detail');
    await detail.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'Mark order #1056 delivered' }).click();
    await expect(page.getByText('Tanvir Hasan', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Shila Rani', { exact: true })).toBeVisible();
    expect(
      (await database.pool.query('select stage from orders where id=$1', [tanvir])).rows[0].stage,
    ).toBe('delivered');

    await page.goto('/orders?stage=returned');
    await expect(page.getByText('RedX · Returned Nov 6')).toBeVisible();
    await expect(page.getByText('Refused at the door')).toBeVisible();
    await capture('returned');

    await page.goto(`/orders?stage=returned&selected=${hasan}`);
    const hasanDetail = page.getByRole('dialog', { name: 'Order #1051' });
    await expect(hasanDetail.getByText('High return risk')).toBeVisible();
    await expect(
      hasanDetail.getByText('Returned 2 of 3 parcels. Ask for an advance.'),
    ).toBeVisible();
    await capture('returned-detail');
  } finally {
    await database.pool.query(
      "delete from outbox_events where store_id=$1 and payload->>'orderId' = any($2::text[])",
      [storeId, orderIds],
    );
    await database.pool.query('delete from orders where store_id=$1 and id=any($2::uuid[])', [
      storeId,
      orderIds,
    ]);
    await database.pool.end();
  }
});
