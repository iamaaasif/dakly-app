import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

import { scrubPage } from './auth-browser';

async function captureAtBothSizes(page: Page, name: string) {
  const evidence = process.env.ANA3_EVIDENCE;
  if (evidence) await mkdir(evidence, { recursive: true });
  await page.evaluate(async () => document.fonts.ready);
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    // The tab row scrolls on a phone and puts the open tab in view when the page opens at that width.
    if (width === 360) {
      await page.reload();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const row = document.querySelector('nav[aria-label="Analytics tabs"]');
            const open = row?.querySelector('[aria-current="page"]');
            if (!row || !open) return false;
            const [outer, inner] = [row.getBoundingClientRect(), open.getBoundingClientRect()];
            return inner.left >= outer.left - 1 && inner.right <= outer.right + 1;
          }),
        )
        .toBe(true);
    }
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    // A full-page capture starts from the top, as the design screenshots do.
    await page.evaluate(() => window.scrollTo(0, 0));
    // The sidebar is as tall as the window, so the window takes the page's height, or enough for the whole menu, for the capture.
    if (evidence && width === 1440)
      await page.setViewportSize({
        width,
        height: Math.max(1240, await page.evaluate(() => document.documentElement.scrollHeight)),
      });
    if (evidence)
      await page.screenshot({ path: resolve(evidence, `${name}-${width}.png`), fullPage: true });
  }
}

async function captureSheet(page: Page, name: string) {
  const evidence = process.env.ANA3_EVIDENCE;
  if (!evidence) return;
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: resolve(evidence, `${name}-${width}.png`) });
  }
}

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
      `insert into campaigns(id,store_id,name,channel,content,sent_count,delivered_count,tapped_count,actual_cost_poisha,started_at) values
       ($2,$1,'Eid offer','sms','{}',400,380,60,14000,now() - interval '3 days'),
       ($3,$1,'Puja winback','whatsapp','{}',300,290,45,28500,now() - interval '5 days')`,
      [shop, sms, whatsapp],
    );
    const welcome = (
      await database.pool.query<{ id: string }>('select gen_random_uuid()::text as id')
    ).rows[0]!.id;
    const version = (
      await database.pool.query<{ id: string }>('select gen_random_uuid()::text as id')
    ).rows[0]!.id;
    await database.pool.query(
      "insert into automations(id,store_id,name,trigger_type,draft_graph) values($1,$2,'Welcome new subscribers','manual','{}')",
      [welcome, shop],
    );
    await database.pool.query(
      'insert into automation_versions(id,store_id,automation_id,version,graph) values($1,$2,$3,1,$4)',
      [version, shop, welcome, '{}'],
    );
    await database.pool.query(
      "update automations set status='active', published_version_id=$1 where id=$2",
      [version, welcome],
    );
    await database.pool.query(
      `with entered as (
         insert into automation_runs(id,store_id,automation_id,version_id,contact_id,trigger_key,current_step_key,status,entered_at)
         select gen_random_uuid(),$1,$2,$3,id,'welcome-'||id,'first','done',now() - interval '2 days'
         from contacts where store_id=$1 limit 80 returning id, contact_id)
       insert into automation_run_steps(id,store_id,run_id,contact_id,step_key,kind,outcome,channel,category,sent_at,cost_poisha)
       select gen_random_uuid(),$1,id,contact_id,'first','send','sent','whatsapp','marketing',now() - interval '2 days',95 from entered`,
      [shop, welcome, version],
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
       union all select $1,day,'marketing_orders','',4 + (59-age)/20 from days
       union all select $1,day,'marketing_orders','channel:whatsapp',3 from days
       union all select $1,day,'marketing_orders','channel:sms',1 from days
       union all select $1,day,'marketing_revenue','campaign:'||$2,200000 from days where age < 10
       union all select $1,day,'marketing_orders','campaign:'||$2,2 from days where age < 10
       union all select $1,day,'marketing_revenue','campaign:'||$3,150000 from days where age < 10
       union all select $1,day,'marketing_orders','campaign:'||$3,1 from days where age < 10
       union all select $1,day,'marketing_revenue','automation:'||$4,120000 from days where age < 10
       union all select $1,day,'marketing_orders','automation:'||$4,1 from days where age < 10`,
      [shop, sms, whatsapp, welcome],
    );
    for (const [caption, kind, reach, reactions, age] of [
      [
        'Thank you for 18,000 followers. Here’s 10% off with code THANKYOU10, all week.',
        'facebook_page',
        6120,
        540,
        8,
      ],
      [
        'Our winter kurti collection is here. Soft cotton, warm colours and easy fits for every day.',
        'instagram',
        4210,
        312,
        5,
      ],
    ] as const) {
      const ids = (
        await database.pool.query<{ post: string; connection: string }>(
          'select gen_random_uuid()::text as post, gen_random_uuid()::text as connection',
        )
      ).rows[0]!;
      await database.pool.query('insert into posts(id,store_id,caption) values($1,$2,$3)', [
        ids.post,
        shop,
        caption,
      ]);
      await database.pool.query(
        "insert into channel_connections(id,store_id,kind,external_account_id,display_name) values($1::uuid,$2,$3,$1::text,'Page')",
        [ids.connection, shop, kind],
      );
      await database.pool.query(
        `insert into post_targets(id,store_id,post_id,channel_connection_id,status,published_at,reach,reactions)
         values(gen_random_uuid(),$1,$2,$3,'published',now() - make_interval(days => $4::int),$5,$6)`,
        [shop, ids.post, ids.connection, age, reach, reactions],
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
    await expect(figures.getByText('200', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('img', { name: /Money from your marketing by week/ }),
    ).toBeVisible();
    await expect(page.getByText('Read (not SMS)')).toBeVisible();

    await captureAtBothSizes(page, 'overview');

    await expect(page.getByRole('region', { name: 'What worked best' })).toBeVisible();
    for (const [tab, ready] of [
      ['campaigns', page.getByRole('link', { name: 'Eid offer' })],
      ['automations', page.getByRole('link', { name: 'Welcome new subscribers' })],
      ['channels', page.getByRole('heading', { name: 'WhatsApp' })],
      ['social', page.getByText('Thank you for 18,000 followers.', { exact: false })],
    ] as const) {
      await page.goto(`/analytics?tab=${tab}`);
      await expect(ready).toBeVisible();
      await captureAtBothSizes(page, tab);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/analytics?tab=campaigns');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^dakly-analytics-campaigns-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/,
    );

    await page.goto('/analytics');
    await expect(page.getByText(/Orders placed within 7 days of a message or post/)).toBeVisible();
    await page.getByRole('button', { name: 'How Dakly counts orders' }).click();
    const sheet = page.getByRole('dialog', { name: 'How Dakly counts orders' });
    await expect(sheet.getByRole('radio', { name: '7 days' })).toBeChecked();
    await expect(sheet.getByText('What is not counted')).toBeVisible();
    await captureSheet(page, 'counting-sheet');
    await page.setViewportSize({ width: 1440, height: 900 });
    await sheet.getByRole('radio', { name: '3 days' }).click();
    await expect(page.getByText('Recalculating with the new 3-day window')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText(/Orders placed within 3 days of a message or post/)).toBeVisible();
    // The test worker may finish the recount before the phone-size capture, so the state is held for the pictures.
    await page.route('**/api/store/attribution', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            json: { windowDays: 3, rebuilding: true, processedOrders: 1200 },
            headers: { 'x-session-context': route.request().headers()['x-session-context'] ?? '' },
          })
        : route.continue(),
    );
    await page.reload();
    await expect(page.getByText('Recalculating with the new 3-day window')).toBeVisible();
    await captureAtBothSizes(page, 'recalculating');
    await page.unroute('**/api/store/attribution');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/analytics');
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
    await database.pool.query(
      "update stores set attribution_window_days = 7, settings = settings - 'attributionRebuild' where id=$1",
      [shop],
    );
    await database.pool.query(
      "delete from outbox_events where store_id=$1 and type='attribution.window_changed'",
      [shop],
    );
    await database.pool.query('delete from automation_run_steps where store_id=$1', [shop]);
    await database.pool.query('delete from automation_runs where store_id=$1', [shop]);
    await database.pool.query(
      'update automations set published_version_id=null where store_id=$1',
      [shop],
    );
    await database.pool.query('delete from automation_versions where store_id=$1', [shop]);
    await database.pool.query('delete from automations where store_id=$1', [shop]);
    await database.pool.query('delete from post_targets where store_id=$1', [shop]);
    await database.pool.query('delete from posts where store_id=$1', [shop]);
    await database.pool.query('delete from channel_connections where store_id=$1', [shop]);
    await database.pool.query('delete from campaign_recipients where store_id=$1', [shop]);
    await database.pool.query('delete from campaigns where store_id=$1', [shop]);
    await database.pool.query('delete from contacts where store_id=$1', [shop]);
    await database.pool.query('delete from store_daily_metrics where store_id=$1', [shop]);
    await database.pool.end();
  }
});
