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
    const response = page.waitForResponse(
      (result) =>
        result.url().endsWith('/api/campaigns') &&
        result.request().method() === 'POST' &&
        result.status() === 201,
    );
    await page.getByRole('button', { name: 'Create SMS draft' }).click();
    const draft: CampaignResponse = await (await response).json();
    ids.push(draft.id);
    await expect(page).toHaveURL(new RegExp(`/campaigns/${draft.id}$`));
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
    await capture(page, 'draft');

    const otherEditor = await context.newPage();
    await otherEditor.goto(`/campaigns/${draft.id}`);
    await expect(otherEditor.getByLabel('Campaign name')).toHaveValue('New Kurti collection');
    await page.getByLabel('Campaign name').fill('Winter Kurti collection');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
    await page.getByLabel('Goal').selectOption('from_scratch');
    await expect(page.getByText('Draft saved.', { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Winter Kurti collection' })).toBeVisible();
    await expect(page.getByLabel('Goal')).toHaveValue('new_collection');
    await otherEditor.getByLabel('Goal').selectOption('from_scratch');
    await otherEditor.getByRole('button', { name: 'Save draft' }).click();
    await expect(otherEditor.getByText('Draft saved.', { exact: true })).toBeVisible();
    await expect(
      otherEditor.getByRole('heading', { name: 'Winter Kurti collection' }),
    ).toBeVisible();
    await expect(otherEditor.getByLabel('Campaign name')).toHaveValue('Winter Kurti collection');
    await otherEditor.close();
    const longName = 'W'.repeat(100);
    await name.fill(longName);
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('heading', { name: longName })).toBeVisible();
    await expect(page.getByLabel('Goal')).toHaveValue('from_scratch');
    await page.setViewportSize({ width: 360, height: 800 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
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
