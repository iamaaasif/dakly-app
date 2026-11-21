import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test('shows profit from marketing orders and leaves out orders without a cost price', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const [shop] = fixture.storeIds;
  const query = (sql: string, values: unknown[]) => database.pool.query(sql, values);
  try {
    const [product, variant] = (
      await query('select gen_random_uuid()::text as a, gen_random_uuid()::text as b', [])
    ).rows.flatMap((row) => [row.a as string, row.b as string]);
    await query("insert into products(id,store_id,name) values($1,$2,'কুর্তি')", [product, shop]);
    await query(
      "insert into product_variants(id,store_id,product_id,title,sku) values($1,$2,$3,'M','kurti-profit')",
      [variant, shop, product],
    );
    const [campaign, reader] = (
      await query('select gen_random_uuid()::text as a, gen_random_uuid()::text as b', [])
    ).rows.flatMap((row) => [row.a as string, row.b as string]);
    await query(
      "insert into campaigns(id,store_id,name,channel,content,sent_count,delivered_count,actual_cost_poisha,started_at) values($1,$2,'Eid offer','sms','{}',1,1,5000,now() - interval '2 days')",
      [campaign, shop],
    );
    await query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'নিপা','manual','customer')",
      [reader, shop],
    );
    await query(
      "insert into campaign_recipients(id,store_id,campaign_id,contact_id,status,sent_at,delivered_at,cost_poisha) values(gen_random_uuid(),$1,$2,$3,'sent',now() - interval '2 days',now() - interval '2 days',5000)",
      [shop, campaign, reader],
    );
    for (const [number, quantity, cost, courier, codFee, otherCost] of [
      [9101, 2, 20000, 6000, 1000, null],
      [9102, 1, 30000, null, null, null],
      [9103, 1, 30000, 6000, null, 'unknown'],
    ] as const) {
      const [order, buyer] = (
        await query('select gen_random_uuid()::text as a, gen_random_uuid()::text as b', [])
      ).rows.flatMap((row) => [row.a as string, row.b as string]);
      await query(
        "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer')",
        [buyer, shop],
      );
      await query(
        `insert into orders(id,store_id,number,source,created_by_type,buyer_contact_id,recipient_name,
           recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,cod_amount_poisha,
           courier_charge_poisha,cod_fee_poisha,created_at,attributed_source_type,attributed_source_id,
           attributed_amount_poisha)
         values($1,$2,$3,'messenger','user',$4,'x','01710000009','Mirpur','Dhaka',100000,100000,$5,$6,
           now() - interval '2 days','campaign',gen_random_uuid(),100000)`,
        [order, shop, number, buyer, courier, codFee],
      );
      await query(
        `insert into order_items(id,store_id,order_id,variant_id,product_name,variant_title,quantity,
           unit_price_poisha,unit_cost_poisha,is_stock_tracked)
         values(gen_random_uuid(),$1,$2,$3,'কুর্তি','M',$4,50000,$5,false)`,
        [shop, order, variant, quantity, cost],
      );
      if (otherCost)
        await query(
          `insert into order_items(id,store_id,order_id,variant_id,product_name,variant_title,quantity,
             unit_price_poisha,unit_cost_poisha,is_stock_tracked)
           values(gen_random_uuid(),$1,$2,$3,'কুর্তি','M',1,50000,null,false)`,
          [shop, order, variant],
        );
    }
    await context.addCookies([
      {
        name: 'dakly_session',
        value: fixture.token,
        url: baseURL!,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/analytics?tab=profit');

    // 2,00,000 − goods 70,000 − delivery 7,000 − messages 5,000 = ৳1,180; the third order has an unknown cost.
    await expect(page.getByRole('heading', { name: 'Profit from marketing' })).toBeVisible();
    await expect(page.getByText('৳1,180').first()).toBeVisible();
    await expect(page.getByText(/Excludes 1 order without a cost price/)).toBeVisible();
    await expect(page.getByText('From 2 orders with every cost price known.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download' })).toHaveCount(0);

    const evidence = process.env.ANA4_EVIDENCE;
    if (evidence) await mkdir(evidence, { recursive: true });
    await page.evaluate(async () => document.fonts.ready);
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.reload();
      await expect(page.getByRole('heading', { name: 'How profit adds up' })).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      if (evidence && width === 1440)
        await page.setViewportSize({
          width,
          height: Math.max(1240, await page.evaluate(() => document.documentElement.scrollHeight)),
        });
      if (evidence)
        await page.screenshot({ path: resolve(evidence, `profit-${width}.png`), fullPage: true });
    }
  } finally {
    await query('delete from campaign_recipients where store_id=$1', [shop]);
    await query('delete from order_items where store_id=$1', [shop]);
    await query('delete from orders where store_id=$1 and number >= 9100', [shop]);
    await query("delete from campaigns where store_id=$1 and name='Eid offer'", [shop]);
    await query('delete from product_variants where store_id=$1', [shop]);
    await query('delete from products where store_id=$1', [shop]);
    await database.pool.end();
  }
});
