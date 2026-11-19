import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import type { CampaignResponse } from '@dakly/contracts/campaigns';
import { createDatabase } from '@dakly/db/client';

async function captureCampaignList(page: Page) {
  const evidence = process.env.CAMP4_LIST_SCREENSHOT_DIR;
  if (evidence) await mkdir(evidence, { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    if (evidence) await page.screenshot({ path: resolve(evidence, `list-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('finds a campaign, opens its builder and reads a sent campaign summary', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const [storeId, otherStoreId] = fixture.storeIds;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const ids: string[] = [];
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);

  async function post(path: string, data: unknown) {
    const session = await (await context.request.get('/api/me/context')).json();
    return context.request.post(`/api${path}`, {
      data,
      headers: { Origin: baseURL!, 'X-Session-Context': session.contextTag },
    });
  }

  async function create(name: string) {
    const response = await post('/campaigns', {
      name,
      goal: 'win_back',
      channel: 'sms',
      content: { text: 'Come back this week for our Puja collection.' },
    });
    expect(response.status()).toBe(201);
    const campaign: CampaignResponse = await response.json();
    ids.push(campaign.id);
    return campaign.id;
  }

  try {
    expect((await post('/me/active-store', { storeId })).status()).toBe(204);
    const draft = await create('Winter Kurti collection');
    const sent = await create('Puja winback');
    await database.pool.query(
      "update campaigns set status='sent', finished_at=now() where store_id=$1 and id=$2",
      [storeId, sent],
    );

    await page.goto('/campaigns');
    await expect(page.getByRole('link', { name: 'Campaigns', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('link', { name: 'Create campaign' })).toHaveAttribute(
      'href',
      '/campaigns/new',
    );
    await expect(page.getByRole('link', { name: 'Winter Kurti collection' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Puja winback' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Puja winback/ })).toContainText(
      'Win back customers',
    );
    await captureCampaignList(page);

    const longName = 'W'.repeat(100);
    await create(longName);
    await page.reload();
    await page.setViewportSize({ width: 360, height: 800 });
    await expect(page.getByRole('list', { name: 'Campaigns' })).toBeVisible();
    await expect(page.getByRole('link', { name: longName })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);

    const draftCard = page.getByRole('listitem').filter({
      has: page.getByRole('link', { name: 'Winter Kurti collection', exact: true }),
    });
    await draftCard.getByText('Draft', { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/campaigns/${draft}$`));
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to campaigns' }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    const search = page.getByLabel('Search', { exact: true });
    const status = page.getByRole('combobox', { name: 'Status', exact: true });
    const channel = page.getByRole('combobox', { name: 'Channel', exact: true });
    const createdFrom = page.getByLabel('Created from', { exact: true });
    const createdThrough = page.getByLabel('Created through', { exact: true });
    const clear = page.getByRole('button', { name: 'Clear filters', exact: true });
    const submitSearch = page.getByRole('button', { name: 'Search', exact: true });
    await search.fill('Unapplied name');
    await status.focus();
    await status.selectOption('sent');
    await expect(page).toHaveURL(/status=sent/);
    await expect.poll(() => new URL(page.url()).searchParams.has('search')).toBe(false);
    await expect(search).toHaveValue('Unapplied name');
    await expect(status).toBeFocused();
    await channel.selectOption('sms');
    await expect(page).toHaveURL(/channel=sms/);
    await createdFrom.fill('2026-11-01');
    await expect(page).toHaveURL(/createdFrom=2026-11-01/);
    await createdThrough.fill('2026-11-30');
    await expect(page).toHaveURL(/createdThrough=2026-11-30/);
    await clear.click();
    await expect(search).toHaveValue('');
    for (const filter of [status, channel, createdFrom, createdThrough])
      await expect(filter).toHaveValue('');

    const bounds = {
      createdFrom: '2020-01-01',
      createdThrough: '2099-12-31',
    };
    await page.goto(`/campaigns?${new URLSearchParams(bounds)}`);
    await expect(createdFrom).toHaveValue('2020-01-01');
    await expect(createdThrough).toHaveValue('2099-12-31');
    await submitSearch.click();
    await expect.poll(() => new URL(page.url()).searchParams.get('limit')).toBe('50');
    for (const [name, value] of Object.entries(bounds))
      expect(new URL(page.url()).searchParams.get(name)).toBe(value);
    await clear.click();
    await expect(page).toHaveURL(/\/campaigns$/);
    await status.selectOption('sent');
    await expect(page).toHaveURL(/status=sent/);
    await search.fill('Puja');
    await expect.poll(() => new URL(page.url()).searchParams.has('search')).toBe(false);
    await submitSearch.click();
    await expect(page).toHaveURL(/search=Puja/);
    const sentRow = page.getByRole('row', { name: /Puja winback/ });
    const sentLink = sentRow.getByRole('link', { name: 'Puja winback', exact: true });
    await expect(sentLink).toBeVisible();
    await expect(page.getByRole('link', { name: 'Winter Kurti collection' })).toHaveCount(0);
    await clear.focus();
    await page.keyboard.press('Tab');
    await expect(sentLink).toBeFocused();
    // Click the status cell at its position, where the row link should receive the click.
    const sentStatus = await sentRow.getByRole('cell', { name: 'Sent', exact: true }).boundingBox();
    if (!sentStatus) throw new Error('Sent status cell was not visible');
    await page.mouse.click(
      sentStatus.x + sentStatus.width / 2,
      sentStatus.y + sentStatus.height / 2,
    );
    await expect(page).toHaveURL(new RegExp(`/campaigns/${sent}$`));
    await expect(page.getByRole('heading', { name: 'Puja winback' })).toBeVisible();
    await expect(page.getByText('Come back this week for our Puja collection.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);

    const otherCampaign = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await database.pool.query(
      "insert into campaigns(id,store_id,name,channel,content) values($1,$2,'Sylhet new collection','sms','{}')",
      [otherCampaign, otherStoreId],
    );
    ids.push(otherCampaign);
    await page.goto('/campaigns?limit=1');
    await page.getByRole('link', { name: 'Next page' }).click();
    await expect(page.getByRole('link', { name: 'First page' })).toBeVisible();
    const listStatus = page.getByRole('region', { name: 'Campaign list' }).getByRole('status');
    await page.getByRole('combobox', { name: 'Current shop' }).selectOption(otherStoreId);
    await expect(listStatus).toContainText('This page has no campaigns.');
    await expect(page.getByRole('link', { name: 'Sylhet new collection' })).toHaveCount(0);
    await page.getByRole('link', { name: 'First page' }).click();
    await expect(page.getByRole('link', { name: 'Sylhet new collection' })).toBeVisible();
    await expect(page).toHaveURL(/\/campaigns\?limit=1$/);
    await expect(page.getByRole('link', { name: 'First page' })).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Current shop' }).selectOption(storeId);
    await expect(page.getByRole('link', { name: longName })).toBeVisible();
    await page.goto(`/campaigns?limit=1&cursor=${otherCampaign}`);
    await expect(listStatus).toContainText('This page has no campaigns.');
    await page.getByRole('link', { name: 'First page' }).click();
    await expect(page.getByRole('link', { name: longName })).toBeVisible();
    const changed = await database.pool.query(
      "update memberships set built_in_role='support_agent' where store_id=$1 and built_in_role='marketer'",
      [otherStoreId],
    );
    expect(changed.rowCount).toBe(1);
    await page.getByRole('link', { name: 'Next page' }).click();
    await expect(page.getByRole('link', { name: 'First page' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Current shop' }).selectOption(otherStoreId);
    await expect(
      page.getByText('You do not have access to this action in the current shop.'),
    ).toBeVisible();
    await expect(page).toHaveURL(/cursor=/);
    await page.getByRole('combobox', { name: 'Current shop' }).selectOption(storeId);
    await page.getByRole('link', { name: 'First page' }).click();
    await expect(page.getByRole('link', { name: longName })).toBeVisible();
  } finally {
    try {
      await database.pool.query(
        "update memberships set built_in_role='marketer' where store_id=$1 and built_in_role='support_agent'",
        [otherStoreId],
      );
      expect((await post('/me/active-store', { storeId })).status()).toBe(204);
      await database.pool.query(
        'delete from campaigns where store_id=any($1::uuid[]) and id=any($2::uuid[])',
        [fixture.storeIds, ids],
      );
    } finally {
      await database.pool.end();
    }
  }
});
