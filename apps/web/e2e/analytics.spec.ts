import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

import { scrubPage } from './auth-browser';

test('shows the overview from the glossary reports and keeps the period and toggle in the URL', async ({
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
  try {
    const { rows } = await database.pool.query<{ sms: string; whatsapp: string }>(
      'select gen_random_uuid()::text as sms, gen_random_uuid()::text as whatsapp',
    );
    const { sms, whatsapp } = rows[0]!;
    await database.pool.query(
      `insert into contacts(id,store_id,name,source,kind)
       select gen_random_uuid(),$1,'গ্রাহক '||n,'manual','customer' from generate_series(1,120) n`,
      [shop],
    );
    await database.pool.query(
      `insert into campaigns(id,store_id,name,channel,content) values
       ($2,$1,'Eid offer','sms','{}'),($3,$1,'Puja winback','whatsapp','{}')`,
      [shop, sms, whatsapp],
    );
    await database.pool.query(
      `insert into campaign_recipients(id,store_id,campaign_id,contact_id,status,sent_at,delivered_at,read_at,tapped_at,cost_poisha)
       select gen_random_uuid(),$1,
         case when n <= 70 then $2::uuid else $3::uuid end, c.id, 'sent',
         now() - interval '2 days', now() - interval '2 days',
         case when n > 70 and n <= 100 then now() - interval '1 day' end,
         case when n % 9 = 0 then now() - interval '1 day' end,
         case when n <= 70 then 35 else 95 end
       from (select id, row_number() over (order by id) as n from contacts where store_id=$1) c`,
      [shop, sms, whatsapp],
    );
    await database.pool.query(
      `with days as (
         select (now() at time zone 'Asia/Dhaka')::date - age as day, age from generate_series(0,59) as age
       )
       insert into store_daily_metrics (store_id,day,metric,dimension,value)
       select $1::uuid,day,'marketing_revenue','',900000 + (59-age)*12000 from days
       union all select $1,day,'marketing_revenue','channel:whatsapp',600000 + (59-age)*7000 from days
       union all select $1,day,'marketing_revenue','channel:sms',300000 + (59-age)*5000 from days
       union all select $1,day,'marketing_orders','',4 + (59-age)/20 from days`,
      [shop],
    );
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
    await page.goto('/analytics');

    await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible();
    await expect(page.getByText(/^from \d+ orders in the last 30 days$/)).toBeVisible();
    await expect(page.getByText('came back for every ৳1 you spent on messages')).toBeVisible();
    const figures = page.getByRole('region', { name: 'Key figures' });
    await expect(figures.getByRole('heading')).toHaveText([
      'Money from marketing',
      'Orders',
      'Messages sent',
      'Tapped your link',
      'Cost of messages',
    ]);
    await expect(figures.getByText('120', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('img', { name: /Money from your marketing by week/ }),
    ).toBeVisible();
    await expect(page.getByText('Read (not SMS)')).toBeVisible();

    await page.evaluate(async () => document.fonts.ready);
    const evidence = process.env.ANA3_EVIDENCE;
    if (evidence) await mkdir(evidence, { recursive: true });
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      if (evidence)
        await page.screenshot({ path: resolve(evidence, `overview-${width}.png`), fullPage: true });
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('checkbox', { name: 'Compare with before' }).click();
    await expect(page).toHaveURL(/compare=off/);
    await expect(page.getByText(/vs the 30 days before/)).toHaveCount(0);
    await page
      .getByRole('navigation', { name: 'Reporting period' })
      .getByRole('link', { name: '3 months' })
      .click();
    await expect(page).toHaveURL(/period=90/);
    await expect(page).toHaveURL(/compare=off/);
    await expect(page.getByText(/in the last 3 months$/)).toBeVisible();
  } finally {
    await scrubPage(page);
    await database.pool.query('delete from campaign_recipients where store_id=$1', [shop]);
    await database.pool.query('delete from campaigns where store_id=$1', [shop]);
    await database.pool.query('delete from contacts where store_id=$1', [shop]);
    await database.pool.query('delete from store_daily_metrics where store_id=$1', [shop]);
    await database.pool.end();
  }
});
