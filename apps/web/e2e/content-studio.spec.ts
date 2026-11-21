import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test, expect, type Locator, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

const evidence = resolve(process.cwd(), '../../docs/design/evidence/soc-5-content-studio-create');

async function capture(page: Page, name: string, scrollTo?: Locator) {
  await mkdir(evidence, { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.mouse.move(width - 1, height - 1);
    if (scrollTo) await scrollTo.scrollIntoViewIfNeeded();
    else await page.evaluate(() => window.scrollTo(0, 0));
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(0);
    await page.screenshot({
      path: resolve(evidence, `${name}-${width}.png`),
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('writes options, saves one to the library and opens it in Create post', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const storeId = fixture.storeIds[0];
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  try {
    await context.addCookies([
      {
        name: 'dakly_session',
        value: fixture.token,
        url: baseURL!,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    expect(
      (
        await context.request.post('/api/me/active-store', {
          data: { storeId },
          headers: { Origin: baseURL! },
        })
      ).status(),
    ).toBe(204);
    const { contextTag } = await (await context.request.get('/api/me/context')).json();
    await database.pool.query(
      `insert into channel_connections(id,store_id,kind,external_account_id,display_name,status,token_expires_at)
       values (gen_random_uuid(),$1,'facebook_page','2001001','Urban Trend','active',null)`,
      [storeId],
    );
    // The real model is not called in tests; a completed run stands in for the one it would record.
    const aiRunId = '00000000-0000-4000-8000-000000000001';
    await database.pool.query(
      `insert into ai_runs(id,store_id,purpose,tier,model,prompt_version,outcome)
       values ($1,$2,'content','writer','test','test','completed')`,
      [aiRunId, storeId],
    );
    await page.route('**/api/brand-profile', (route) =>
      route.fulfill({
        headers: { 'x-session-context': contextTag },
        json: {
          voice: 'Friendly, Warm',
          audience: null,
          preferredWords: [],
          wordsToAvoid: [],
          callToActionBn: null,
          callToActionEn: null,
        },
      }),
    );
    await page.route('**/api/content-pieces/credits', (route) =>
      route.fulfill({
        headers: { 'x-session-context': contextTag },
        json: { allowance: 1000, remaining: 580, resetsAt: '2026-12-01T04:00:00.000Z' },
      }),
    );
    await page.route('**/api/content-pieces/generate', (route) =>
      route.fulfill({
        headers: { 'x-session-context': contextTag },
        json: {
          aiRunId,
          options: [
            'New winter kurtis are here. 15% off this weekend, cash on delivery.',
            'Stay warm in style. Our winter kurtis are 15% off this weekend.',
            'Winter kurtis, 15% off. Order now and pay on delivery.',
          ],
        },
      }),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/content-studio');
    await expect(page.getByRole('heading', { name: 'AI Content Studio', level: 1 })).toBeVisible();
    await expect(page.getByText('580 AI credits left').first()).toBeVisible();
    await expect(page.getByText('Uses 3 AI credits · 580 AI credits left')).toBeVisible();
    await capture(page, 'create');
    await capture(page, 'create-style', page.getByText('Use my Brand Profile'));

    await page.getByLabel(/Anything else Dakly should know/).fill('New winter kurtis, 15% off');
    await page.getByRole('button', { name: /Write 3 options/ }).click();
    await expect(page.getByRole('article')).toHaveCount(3);
    await capture(page, 'options', page.getByRole('article').first());

    const first = page.getByRole('article').first();
    await first.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(first.getByRole('button', { name: 'Saved' })).toBeVisible();
    await first.getByRole('button', { name: 'Schedule post' }).click();
    await expect(page).toHaveURL(/\/social\/posts\/new\?piece=/);
    await expect(page.getByRole('textbox', { name: 'Caption', exact: true })).toHaveValue(
      /New winter kurtis/,
    );
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page).toHaveURL(/\/social\/posts$/);
    const posts = await database.pool.query<{ is_ai_written: boolean }>(
      'select is_ai_written from posts where store_id=$1',
      [storeId],
    );
    expect(posts.rows).toEqual([{ is_ai_written: true }]);
  } finally {
    await database.pool.query('delete from post_targets where store_id=$1', [storeId]);
    await database.pool.query('delete from posts where store_id=$1', [storeId]);
    await database.pool.query('delete from content_pieces where store_id=$1', [storeId]);
    await database.pool.query('delete from ai_runs where store_id=$1', [storeId]);
    await database.pool.query('delete from channel_connections where store_id=$1', [storeId]);
    await database.pool.end();
  }
});
