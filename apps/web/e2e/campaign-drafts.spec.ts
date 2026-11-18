import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import type { CampaignResponse } from '@dakly/contracts/campaigns';
import { createDatabase } from '@dakly/db/client';

async function capture(page: Page, screen: string) {
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
    if (evidence) await page.screenshot({ path: resolve(evidence, `${screen}-${width}.png`) });
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
  try {
    expect((await post('/me/active-store', { storeId })).status()).toBe(204);
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
    await capture(page, 'new');
    const name = page.getByLabel('Campaign name');
    await name.fill('   ');
    await page.getByRole('button', { name: 'Create SMS draft' }).click();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAccessibleDescription('Enter a campaign name.');
    await page.getByLabel('Campaign name').fill('New Kurti collection');
    await expect(name).toHaveAttribute('aria-invalid', 'false');
    await page.getByLabel('Goal').selectOption('new_collection');
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
    const create = page.getByRole('button', { name: 'Create SMS draft' });
    await create.evaluate((button: HTMLButtonElement) => {
      button.form?.requestSubmit();
      button.form?.requestSubmit();
    });
    const draft: CampaignResponse = await (await response).json();
    ids.push(draft.id);
    try {
      await startedNavigation;
      await expect(page).toHaveURL(/\/campaigns\/new$/);
      await expect(page.getByText('Opening draft…', { exact: true })).toBeVisible();
      await expect(create).toBeDisabled();
      await expect(name).toBeDisabled();
      await create.evaluate((button: HTMLButtonElement) => button.form?.requestSubmit());
    } finally {
      releaseNavigation();
      await page.unrouteAll({ behavior: 'wait' });
    }
    await expect(page).toHaveURL(new RegExp(`/campaigns/${draft.id}$`));
    expect(draftPosts).toBe(1);
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
    await capture(page, 'draft');

    const otherEditor = await context.newPage();
    await otherEditor.goto(`/campaigns/${draft.id}`);
    await expect(otherEditor.getByLabel('Campaign name')).toHaveValue('New Kurti collection');
    await otherEditor.getByLabel('Campaign name').fill('New Kurti collection ');
    await otherEditor.getByLabel('Goal').selectOption('from_scratch');
    await page.getByLabel('Campaign name').fill('Winter Kurti collection');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
    await page.getByLabel('Goal').selectOption('from_scratch');
    await expect(page.getByText('Draft saved.', { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Winter Kurti collection' })).toBeVisible();
    await expect(page.getByLabel('Goal')).toHaveValue('new_collection');
    await otherEditor.bringToFront();
    await otherEditor.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await expect(
      otherEditor.getByRole('heading', { name: 'Winter Kurti collection' }),
    ).toBeVisible();
    await expect(otherEditor.getByLabel('Campaign name')).toHaveValue('Winter Kurti collection');
    await expect(otherEditor.getByLabel('Goal')).toHaveValue('from_scratch');
    await otherEditor.getByRole('button', { name: 'Save draft' }).click();
    await expect(otherEditor.getByText('Draft saved.', { exact: true })).toBeVisible();
    await expect(
      otherEditor.getByRole('heading', { name: 'Winter Kurti collection' }),
    ).toBeVisible();
    await expect(otherEditor.getByLabel('Campaign name')).toHaveValue('Winter Kurti collection');
    const otherName = otherEditor.getByLabel('Campaign name');
    const otherSave = otherEditor.getByRole('button', { name: 'Save draft' });
    await otherName.fill('Summer Kurti collection');
    await name.fill('Summer Kurti collection');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('heading', { name: 'Summer Kurti collection' })).toBeVisible();
    await otherEditor.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await expect(otherSave).toBeDisabled();

    await name.fill('Puja Kurti collection');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('heading', { name: 'Puja Kurti collection' })).toBeVisible();
    await otherEditor.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await expect(otherName).toHaveValue('Puja Kurti collection');
    await otherEditor.getByLabel('Goal').selectOption('seasonal');
    const goalPatch = otherEditor.waitForRequest(
      (request) =>
        request.method() === 'PATCH' && request.url().endsWith(`/api/campaigns/${draft.id}`),
    );
    await otherSave.click();
    expect((await goalPatch).postDataJSON()).toEqual({ goal: 'seasonal' });
    await expect(otherEditor.getByText('Draft saved.', { exact: true })).toBeVisible();
    await otherEditor.close();
    await page.reload();
    await expect(name).toHaveValue('Puja Kurti collection');
    await expect(page.getByLabel('Goal')).toHaveValue('seasonal');
    const longName = 'W'.repeat(100);
    await name.fill(longName);
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('heading', { name: longName })).toBeVisible();
    await expect(page.getByLabel('Goal')).toHaveValue('seasonal');
    await page.setViewportSize({ width: 360, height: 800 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });

    await database.pool.query(
      "update campaigns set status='sent', finished_at=now() where store_id=$1 and id=$2",
      [storeId, draft.id],
    );
    const detailUrl = `**/api/campaigns/${draft.id}`;
    let failStatusRefresh = true;
    await page.route(detailUrl, (route) =>
      route.request().method() === 'GET' && failStatusRefresh
        ? route.fulfill({ status: 503 })
        : route.continue(),
    );
    const conflict = page.waitForResponse(
      (result) => result.request().method() === 'PATCH' && result.status() === 409,
    );
    await name.fill('A change after approval');
    await page.getByRole('button', { name: 'Save draft' }).click();
    expect(await (await conflict).json()).toMatchObject({ error: { code: 'CAMPAIGN_NOT_DRAFT' } });
    const retry = page.getByRole('button', { name: 'Try again' });
    await expect(retry).toBeVisible({ timeout: 12_000 });
    await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);
    failStatusRefresh = false;
    await retry.click();
    await expect(page.getByRole('region', { name: 'Saved campaign' })).toBeVisible();
    await page.unroute(detailUrl);

    await database.pool.query('delete from campaigns where store_id=$1 and id=$2', [
      storeId,
      draft.id,
    ]);
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByRole('alert').filter({ hasText: 'Campaign not found' })).toContainText(
      'Campaign not found',
    );
    await expect(page.getByRole('region', { name: 'Saved campaign' })).toHaveCount(0);

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
    await database.pool.end();
  }
});
