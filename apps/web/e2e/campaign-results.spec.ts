import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { type BrowserContext, expect, type Page, test } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

type Channel = 'sms' | 'messenger';

// Seeds one sent campaign with three customers (delivered, failed, delivered and tapped) and
// removes it afterwards. A Messenger campaign also gets a Page, a cost and one attributed order.
async function withSentCampaign(
  context: BrowserContext,
  baseURL: string,
  channel: Channel,
  run: (campaignId: string) => Promise<void>,
) {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const [storeId] = fixture.storeIds;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const query = (sql: string, values: unknown[]) => database.pool.query(sql, values);
  const campaignId = randomUUID();
  const pageId = randomUUID();
  const contactIds = [randomUUID(), randomUUID(), randomUUID()];
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL, httpOnly: true, sameSite: 'Lax' },
  ]);
  const session = await (await context.request.get('/api/me/context')).json();
  await context.request.post('/api/me/active-store', {
    data: { storeId },
    headers: { Origin: baseURL, 'X-Session-Context': session.contextTag },
  });
  const isMessenger = channel === 'messenger';
  try {
    if (isMessenger)
      await query(
        `insert into channel_connections(id,store_id,kind,external_account_id,display_name,connected_at)
         values($1::uuid,$2,'facebook_page',$1::text,'Dhaka Threads Page', now() - interval '30 days')`,
        [pageId, storeId],
      );
    await query(
      `insert into campaigns(id,store_id,name,channel,channel_connection_id,goal,content,status,
         started_at,finished_at,recipients_count,sent_count,delivered_count,read_count,tapped_count,
         failed_count,counts_at,actual_cost_poisha)
       values($1,$2,'Puja winback',$3,$4,'win_back','{"text":"Come back this week."}','sent',
         now() - interval '10 days', now() - interval '10 days',3,3,2,$5,1,1,now(),$6)`,
      [
        campaignId,
        storeId,
        channel,
        isMessenger ? pageId : null,
        isMessenger ? 1 : 0,
        isMessenger ? 50000 : 0,
      ],
    );
    const people = [
      ['রিনা', '01710000101', 'delivered', null],
      ['সুমি', '01710000102', 'failed', 'recipient_unreachable'],
      ['মিতা', '01710000103', 'read', null],
    ] as const;
    for (const [index, [name, phone, status, error]] of people.entries()) {
      await query(
        "insert into contacts(id,store_id,name,phone,source,kind) values($1,$2,$3,$4,'manual','customer')",
        [contactIds[index], storeId, name, phone],
      );
      await query(
        `insert into campaign_recipients(id,store_id,campaign_id,contact_id,status,sent_at,delivered_at,read_at,tapped_at,error_code)
         values($1,$2,$3,$4,$5,now(),case when $5::text<>'failed' then now() end,
           case when $5::text='read' then now() end,case when $4::uuid=$6::uuid then now() end,$7)`,
        [randomUUID(), storeId, campaignId, contactIds[index], status, contactIds[2], error],
      );
    }
    if (isMessenger) {
      await query(
        `insert into consents(id,store_id,contact_id,channel,status,source,captured_at)
         values($1,$2,$3,'sms','granted','checkout',now() - interval '30 days')`,
        [randomUUID(), storeId, contactIds[1]],
      );
      await query(
        `insert into orders(id,store_id,number,source,created_by_type,buyer_contact_id,
          recipient_name,recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,
          cod_amount_poisha,attributed_source_type,attributed_source_id,attributed_amount_poisha)
         values($1,$2,9001,'manual','user',$3,'মিতা','01710000103','Mirpur','Dhaka',125000,125000,
          'campaign',$4,125000)`,
        [randomUUID(), storeId, contactIds[2], campaignId],
      );
      await query(
        `insert into store_daily_metrics (store_id,day,metric,dimension,value)
          values($1,(now() at time zone 'Asia/Dhaka')::date,'marketing_revenue',$2,125000),
                ($1,(now() at time zone 'Asia/Dhaka')::date,'marketing_orders',$2,1)`,
        [storeId, `campaign:${campaignId}`],
      );
    }
    await run(campaignId);
  } finally {
    try {
      await query('delete from store_daily_metrics where store_id=$1 and dimension=$2', [
        storeId,
        `campaign:${campaignId}`,
      ]);
      await query('delete from orders where store_id=$1 and number=9001', [storeId]);
      await query('delete from campaigns where store_id=$1 and name like $2', [
        storeId,
        '%Puja winback%',
      ]);
      await query('delete from channel_connections where id=$1', [pageId]);
      await query('delete from contacts where store_id=$1 and id=any($2::uuid[])', [
        storeId,
        contactIds,
      ]);
    } finally {
      await database.pool.end();
    }
  }
}

async function capture(page: Page, name: string) {
  const evidence = process.env.CAMP15_RESULTS_EVIDENCE;
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
      await page.screenshot({ path: resolve(evidence, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('reads a sent SMS campaign: no cost, failures, customers and copy actions', async ({
  page,
  context,
  baseURL,
}) => {
  await withSentCampaign(context, baseURL!, 'sms', async (campaignId) => {
    await page.goto(`/campaigns/${campaignId}`);
    await expect(page.getByRole('heading', { name: 'Campaign results' })).toBeVisible();
    await expect(page.getByText(/Results final on/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Failures' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Read' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Duplicate' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Resend/ })).toBeHidden();
    await page.getByRole('tab', { name: 'Failed' }).click();
    await expect(page.getByRole('link', { name: 'সুমি' })).toBeVisible();
    await expect(page).toHaveURL(/outcome=failed/);
    await capture(page, 'sms-results');
    await page.getByRole('button', { name: 'Duplicate' }).click();
    await expect(page).toHaveURL(/\/campaigns\/(?!new)[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Campaign results' })).toBeHidden();
  });
});

test('reads a sent Messenger campaign: cost, return, orders and resend', async ({
  page,
  context,
  baseURL,
}) => {
  await withSentCampaign(context, baseURL!, 'messenger', async (campaignId) => {
    await page.goto(`/campaigns/${campaignId}?outcome=ordered`);
    await expect(page.getByText('Return per ৳1', { exact: true })).toBeVisible();
    await expect(page.getByText('৳500', { exact: true })).toBeVisible();
    await expect(page.getByText(/can be reached by SMS/)).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Read' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Resend/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'মিতা' })).toBeVisible();
    await expect(page.getByText(/৳1,250 · /)).toBeVisible();
    await capture(page, 'messenger-results');
  });
});
