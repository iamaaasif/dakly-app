import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import type { CampaignResponse } from '@dakly/contracts/campaigns';
import { createDatabase } from '@dakly/db/client';

test('reads a sent campaign: cost, return, failures, customers and copy actions', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const [storeId] = fixture.storeIds;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const query = (sql: string, values: unknown[]) => database.pool.query(sql, values);
  const contactIds = [randomUUID(), randomUUID(), randomUUID()];
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  const session = async () => (await context.request.get('/api/me/context')).json();
  const headers = async () => ({
    Origin: baseURL!,
    'X-Session-Context': (await session()).contextTag,
  });
  let campaignId = '';

  try {
    await context.request.post('/api/me/active-store', {
      data: { storeId },
      headers: await headers(),
    });
    const created = await context.request.post('/api/campaigns', {
      data: {
        name: 'Puja winback',
        goal: 'win_back',
        channel: 'sms',
        content: { text: 'Come back this week.' },
      },
      headers: await headers(),
    });
    expect(created.status()).toBe(201);
    campaignId = ((await created.json()) as CampaignResponse).id;
    await query(
      "update campaigns set status='sent', started_at=now() - interval '10 days', finished_at=now() - interval '10 days' where store_id=$1 and id=$2",
      [storeId, campaignId],
    );
    await query(
      `update campaigns set recipients_count=3, sent_count=3, delivered_count=2, tapped_count=1,
         failed_count=1, counts_at=now() where store_id=$1 and id=$2`,
      [storeId, campaignId],
    );
    const people = [
      ['রিনা', '01710000101', 'delivered', null],
      ['সুমি', '01710000102', 'failed', 'recipient_unreachable'],
      ['মিতা', '01710000103', 'delivered', null],
    ] as const;
    for (const [index, [name, phone, status, error]] of people.entries()) {
      await query(
        "insert into contacts(id,store_id,name,phone,source,kind) values($1,$2,$3,$4,'manual','customer')",
        [contactIds[index], storeId, name, phone],
      );
      await query(
        `insert into campaign_recipients(id,store_id,campaign_id,contact_id,status,sent_at,delivered_at,tapped_at,error_code)
         values($1,$2,$3,$4,$5,now(),case when $5::text='delivered' then now() end,case when $4::uuid=$6::uuid then now() end,$7)`,
        [randomUUID(), storeId, campaignId, contactIds[index], status, contactIds[2], error],
      );
    }

    await page.goto(`/campaigns/${campaignId}`);
    await expect(page.getByRole('heading', { name: 'Campaign results' })).toBeVisible();
    await expect(page.getByText('Return per ৳1', { exact: true })).toBeVisible();
    await expect(page.getByText('Cost', { exact: true })).toBeVisible();
    await expect(page.getByText(/Results final on/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Failures' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Failed' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Duplicate' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Resend/ })).toBeHidden();
    await page.getByRole('tab', { name: 'Failed' }).click();
    await expect(page.getByRole('link', { name: 'সুমি' })).toBeVisible();
    await expect(page).toHaveURL(/outcome=failed/);

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
        await page.screenshot({ path: resolve(evidence, `results-${width}.png`), fullPage: true });
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'Duplicate' }).click();
    await expect(page).toHaveURL(/\/campaigns\/(?!new)[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Campaign results' })).toBeHidden();
  } finally {
    try {
      await query('delete from campaigns where store_id=$1 and name like $2', [
        storeId,
        '%Puja winback%',
      ]);
      await query('delete from contacts where store_id=$1 and id=any($2::uuid[])', [
        storeId,
        contactIds,
      ]);
    } finally {
      await database.pool.end();
    }
  }
});
