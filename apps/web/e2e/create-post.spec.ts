import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test, expect, type Locator, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

const evidence = resolve(process.cwd(), '../../docs/design/evidence/soc-5-create-post');

async function capture(page: Page, name: string, scrollTo?: Locator) {
  await mkdir(evidence, { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.mouse.move(width - 1, height - 1);
    await scrollTo?.scrollIntoViewIfNeeded();
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

test('writes a caption and schedules the post', async ({ page, context, baseURL }) => {
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
    const accounts = await database.pool.query<{ id: string; kind: string }>(
      `insert into channel_connections(id,store_id,kind,external_account_id,display_name,status,token_expires_at) values
         (gen_random_uuid(),$1,'facebook_page','2001001','Urban Trend','active',null),
         (gen_random_uuid(),$1,'instagram','2001002','@urbantrend.bd','needs_reconnect','2026-11-05T06:00:00Z')
       returning id, kind`,
      [storeId],
    );
    expect(accounts.rowCount).toBe(2);
    expect(
      (
        await context.request.post('/api/me/active-store', {
          data: { storeId },
          headers: { Origin: baseURL! },
        })
      ).status(),
    ).toBe(204);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/social/posts/new');
    await expect(page.getByRole('heading', { name: 'Create post', level: 1 })).toBeVisible();
    await expect(page.getByText('Access expired')).toBeVisible();
    await expect(page.getByText('Coming soon')).toBeVisible();
    await capture(page, 'create-post');

    await page.getByRole('textbox', { name: 'Caption', exact: true }).fill('New winter kurtis');
    await expect(page.getByRole('complementary', { name: 'Preview' })).toContainText(
      'New winter kurtis',
    );
    await capture(page, 'caption-written', page.getByRole('region', { name: 'Caption' }));

    await page.getByRole('radio', { name: /Pick date and time/ }).check();
    await page.getByLabel('Scheduled time').fill('2027-03-01T10:00');
    await page.getByRole('button', { name: 'Schedule', exact: true }).click();
    await expect(page).toHaveURL(/\/social\/posts$/);
    const scheduled = await database.pool.query<{ is_ai_written: boolean; status: string }>(
      'select p.is_ai_written, t.status from posts p join post_targets t on t.post_id = p.id where p.store_id=$1',
      [storeId],
    );
    expect(scheduled.rows).toEqual([{ is_ai_written: false, status: 'scheduled' }]);

    await page.goto('/social/posts/new');
    await page.getByRole('textbox', { name: 'Caption', exact: true }).fill('Typed by a person');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page).toHaveURL(/\/social\/posts$/);
    const drafts = await database.pool.query<{ is_ai_written: boolean; status: string }>(
      "select p.is_ai_written, t.status from posts p join post_targets t on t.post_id = p.id where p.store_id=$1 and p.caption='Typed by a person'",
      [storeId],
    );
    expect(drafts.rows).toEqual([{ is_ai_written: false, status: 'draft' }]);
  } finally {
    await database.pool.query('delete from post_targets where store_id=$1', [storeId]);
    await database.pool.query('delete from posts where store_id=$1', [storeId]);
    await database.pool.query('delete from channel_connections where store_id=$1', [storeId]);
    await database.pool.end();
  }
});
