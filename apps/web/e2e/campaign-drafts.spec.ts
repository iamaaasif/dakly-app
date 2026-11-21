import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import type { CampaignResponse } from '@dakly/contracts/campaigns';
import { createDatabase } from '@dakly/db/client';

// A full-page shot at 360 px shows a long screen below the fold, such as the estimate card.
async function capture(page: Page, screen: string, fullPage = false) {
  const evidence = process.env.CAMP4_SCREENSHOT_DIR;
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
      await page.screenshot({ path: resolve(evidence, `${screen}-${width}.png`), fullPage });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('saves an SMS draft and opens a sent campaign read-only', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
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
  const storeId = fixture.storeIds[0];
  const ids: string[] = [];
  const segmentIds: string[] = [];
  const contactIds: string[] = [];
  try {
    expect((await post('/me/active-store', { storeId })).status()).toBe(204);
    const segment = await post('/segments', {
      name: 'Dhaka customers',
      rules: {
        match: 'all',
        conditions: [{ field: 'district', operator: 'is_any_of', values: ['Dhaka'] }],
      },
    });
    expect(segment.status()).toBe(201);
    segmentIds.push((await segment.json()).id);
    // Three Dhaka customers agreed to SMS and one did not, so the estimate shows a skip line.
    const phoneBase = 1_700_000_000 + Math.floor(Math.random() * 90_000_000);
    for (const [index, consented] of [true, true, true, false].entries()) {
      const contactId = randomUUID();
      contactIds.push(contactId);
      await database.pool.query(
        "insert into contacts(id,store_id,name,phone,source,kind,district) values($1,$2,$3,$4,'manual','customer','Dhaka')",
        [contactId, storeId, `Audience customer ${index + 1}`, `0${phoneBase + index}`],
      );
      if (consented)
        await database.pool.query(
          "insert into consents(id,store_id,contact_id,channel,status,source) values(gen_random_uuid(),$1,$2,'sms','granted','checkout')",
          [storeId, contactId],
        );
    }
    const created = await post('/campaigns', {
      name: 'Puja winback',
      goal: 'win_back',
      channel: 'sms',
      content: { text: 'Come back this week for our Puja collection.' },
    });
    expect(created.status()).toBe(201);
    const sent: CampaignResponse = await created.json();
    ids.push(sent.id);
    await database.pool.query(
      "update campaigns set status='sent', finished_at=now() where store_id=$1 and id=$2",
      [storeId, sent.id],
    );

    await page.goto('/campaigns/new');
    await expect(page.getByRole('heading', { name: 'New campaign' })).toBeVisible();
    for (const channel of ['WhatsApp', 'SMS', 'Facebook Messenger', 'Instagram DM']) {
      await expect(page.getByRole('heading', { name: channel, exact: true })).toBeVisible();
    }
    await expect(page.getByText('Connect first', { exact: true })).toHaveCount(3);
    await expect(page.getByLabel('Campaign name')).toBeHidden();
    await capture(page, 'new');
    await page.getByRole('button', { name: 'Create SMS', exact: true }).click();
    await expect(page.getByLabel('Campaign name')).toBeFocused();
    await page.getByRole('button', { name: 'Back to channels' }).click();
    await expect(page.getByLabel('Campaign name')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Create SMS', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Create SMS', exact: true }).click();
    const name = page.getByLabel('Campaign name');
    await name.fill('   ');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAccessibleDescription('Enter a campaign name.');
    await page.getByLabel('Campaign name').fill('New Kurti collection');
    await expect(name).toHaveAttribute('aria-invalid', 'false');
    await page.getByText('Promote a new collection', { exact: true }).click();
    let draftPosts = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/campaigns')) draftPosts++;
    });
    let releaseNavigation!: () => void;
    let navigationRequested!: () => void;
    const holdNavigation = new Promise<void>((resolve) => (releaseNavigation = resolve));
    const startedNavigation = new Promise<void>((resolve) => (navigationRequested = resolve));
    const isDraftNavigation = (url: URL) => /^\/campaigns\/[\da-f-]{36}$/.test(url.pathname);
    await page.route(isDraftNavigation, async (route) => {
      navigationRequested();
      await holdNavigation;
      await route.continue();
    });
    const response = page.waitForResponse(
      (result) =>
        result.url().endsWith('/api/campaigns') &&
        result.request().method() === 'POST' &&
        result.status() === 201,
    );
    const create = page.getByRole('button', { name: 'Save draft' });
    await create.click();
    const draft: CampaignResponse = await (await response).json();
    ids.push(draft.id);
    try {
      await startedNavigation;
      await expect(page).toHaveURL(/\/campaigns\/new$/);
      await expect(page.getByText('Opening draft…', { exact: true })).toBeVisible();
      await expect(create).toBeDisabled();
      await expect(name).toBeDisabled();
    } finally {
      releaseNavigation();
      await page.unrouteAll({ behavior: 'wait' });
    }
    await expect(page).toHaveURL(new RegExp(`/campaigns/${draft.id}$`));
    expect(draftPosts).toBe(1);
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
    await capture(page, 'draft');

    const saveDraft = page.getByRole('button', { name: 'Save draft' });
    const rename = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' && request.url().endsWith(`/api/campaigns/${draft.id}`),
    );
    await name.fill('Winter Kurti collection');
    await saveDraft.click();
    expect((await rename).postDataJSON()).toEqual({ name: 'Winter Kurti collection' });
    await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
    await expect(saveDraft).toBeDisabled();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Winter Kurti collection' })).toBeVisible();
    await expect(name).toHaveValue('Winter Kurti collection');
    const goal = page.getByRole('radio', { name: 'Seasonal campaign' });
    await expect(page.getByRole('radio', { name: 'Promote a new collection' })).toBeChecked();
    const changeGoal = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' && request.url().endsWith(`/api/campaigns/${draft.id}`),
    );
    await page.getByText('Seasonal campaign', { exact: true }).click();
    await saveDraft.click();
    expect((await changeGoal).postDataJSON()).toEqual({ goal: 'seasonal' });
    await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(goal).toBeChecked();
    await expect(name).toHaveValue('Winter Kurti collection');

    const detailUrl = `**/api/campaigns/${draft.id}`;
    await page.route(detailUrl, (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 409,
            json: {
              error: { code: 'CAMPAIGN_NOT_DRAFT', message: 'This campaign is no longer a draft' },
            },
          })
        : route.continue(),
    );
    await name.fill('Rejected campaign name');
    await saveDraft.click();
    await expect(
      page.getByText('This campaign is no longer a draft', { exact: true }),
    ).toBeVisible();
    await page.unroute(detailUrl);

    const longName = 'W'.repeat(100);
    await name.fill(longName);
    await saveDraft.click();
    await expect(page.getByRole('heading', { name: longName })).toBeVisible();
    await expect(goal).toBeChecked();
    await page.setViewportSize({ width: 360, height: 800 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });

    await name.fill('Winter Kurti collection');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/step=content$/);
    await page
      .getByLabel('Message', { exact: true })
      .fill('Winter Kurti collection is in. Order today and get free delivery in Dhaka.');
    await expect(page.getByText('Live preview · SMS', { exact: true })).toBeVisible();
    await capture(page, 'sms-content-step');
    await expect(page.getByText(/ · 1 SMS part\./)).toBeVisible();
    await page.getByRole('link', { name: '3. Audience' }).click();
    await page.getByRole('group', { name: 'Send to' }).getByLabel('Dhaka customers').click();
    const saveAudience = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' && request.url().endsWith(`/api/campaigns/${draft.id}`),
    );
    await page.getByRole('button', { name: 'Save draft' }).click();
    expect((await saveAudience).postDataJSON()).toEqual({
      content: {
        text: 'Winter Kurti collection is in. Order today and get free delivery in Dhaka.',
      },
      includeSegmentIds: segmentIds,
    });
    await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
    const estimateCard = page.getByRole('region', { name: 'Estimate' });
    await expect(estimateCard).toContainText('3 SMS credits');
    await expect(estimateCard).toContainText('1 have not agreed to messages');
    await capture(page, 'sms-audience-step', true);

    await page.goto(`/campaigns/${sent.id}`);
    await expect(page.getByRole('heading', { name: 'Puja winback' })).toBeVisible();
    await expect(page.getByText('Come back this week for our Puja collection.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);
    await capture(page, 'summary');
  } finally {
    await database.pool.query('delete from campaigns where store_id=$1 and id=any($2::uuid[])', [
      storeId,
      ids,
    ]);
    await database.pool.query(
      'delete from consents where store_id=$1 and contact_id=any($2::uuid[])',
      [storeId, contactIds],
    );
    await database.pool.query('delete from contacts where store_id=$1 and id=any($2::uuid[])', [
      storeId,
      contactIds,
    ]);
    await database.pool.query('delete from segments where store_id=$1 and id=any($2::uuid[])', [
      storeId,
      segmentIds,
    ]);
    await database.pool.end();
  }
});

test('campaign routes update permissions after switching shops', async ({
  page,
  context,
  baseURL,
}) => {
  const { token, storeIds } = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const [ownerStore, supportStore] = storeIds;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  let campaignId: string | undefined;

  await context.addCookies([
    { name: 'dakly_session', value: token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  async function post(path: string, data: unknown) {
    const session = await (await context.request.get('/api/me/context')).json();
    return context.request.post(`/api${path}`, {
      data,
      headers: { Origin: baseURL!, 'X-Session-Context': session.contextTag },
    });
  }

  try {
    expect((await post('/me/active-store', { storeId: ownerStore })).status()).toBe(204);
    const created = await post('/campaigns', { name: 'Owner shop draft', channel: 'sms' });
    expect(created.status()).toBe(201);
    campaignId = ((await created.json()) as CampaignResponse).id;
    const changed = await database.pool.query(
      "update memberships set built_in_role='support_agent' where store_id=$1 and built_in_role='marketer'",
      [supportStore],
    );
    expect(changed.rowCount).toBe(1);

    for (const [path, heading] of [
      ['/campaigns/new', 'New campaign'],
      [`/campaigns/${campaignId}`, 'Owner shop draft'],
    ]) {
      expect((await post('/me/active-store', { storeId: supportStore })).status()).toBe(204);
      await page.goto(path!);
      await expect(
        page.getByText('You do not have access to this action in the current shop.'),
      ).toBeVisible();
      await page.getByRole('combobox', { name: 'Current shop' }).selectOption(ownerStore);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
  } finally {
    await database.pool.query(
      "update memberships set built_in_role='marketer' where store_id=$1 and built_in_role='support_agent'",
      [supportStore],
    );
    if (campaignId)
      await database.pool.query('delete from campaigns where store_id=$1 and id=$2', [
        ownerStore,
        campaignId,
      ]);
    await database.pool.end();
  }
});
