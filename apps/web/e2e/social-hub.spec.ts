import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test, expect, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

const evidence = resolve(process.cwd(), '../../docs/design/evidence/soc-5-social-hub');

async function capture(page: Page, name: string) {
  await mkdir(evidence, { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.mouse.move(width - 1, height - 1);
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

test('shows accounts, drafts and the reconnect banner', async ({ page, context, baseURL }) => {
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
    const { rows } = await database.pool.query<{ user_id: string }>(
      'select user_id from memberships where store_id=$1 limit 1',
      [storeId],
    );
    const userId = rows[0]!.user_id;
    const accounts = await database.pool.query<{ id: string; kind: string }>(
      `insert into channel_connections(id,store_id,kind,external_account_id,display_name,status,token_expires_at) values
         (gen_random_uuid(),$1,'facebook_page','2001001','Urban Trend','active',null),
         (gen_random_uuid(),$1,'instagram','2001002','@urbantrend.bd','needs_reconnect','2026-11-05T06:00:00Z')
       returning id, kind`,
      [storeId],
    );
    const page_ = accounts.rows.find(({ kind }) => kind === 'facebook_page')!.id;
    const instagram = accounts.rows.find(({ kind }) => kind === 'instagram')!.id;
    for (const [caption, targets, edited] of [
      ['Mustard silk scarves are back in stock.', [page_, instagram], '2026-11-06T10:20:00Z'],
      ['Navy or maroon? Our new cotton Panjabi comes in both.', [page_], '2026-11-05T05:05:00Z'],
      [null, [page_, instagram], '2026-11-03T15:40:00Z'],
    ] as const) {
      const post = await database.pool.query<{ id: string }>(
        'insert into posts(id,store_id,caption,created_by_user_id,created_at,updated_at) values(gen_random_uuid(),$1,$2,$3,$4,$4) returning id',
        [storeId, caption, userId, edited],
      );
      for (const target of targets)
        await database.pool.query(
          'insert into post_targets(id,store_id,post_id,channel_connection_id) values(gen_random_uuid(),$1,$2,$3)',
          [storeId, post.rows[0]!.id, target],
        );
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/social');
    await expect(page.getByRole('heading', { name: 'Social hub', level: 1 })).toBeVisible();
    const channels = page.getByRole('region', { name: 'Connected channels' });
    await expect(channels.getByText('Access expired')).toBeVisible();
    await expect(page.getByText('Add a caption or photo')).toBeVisible();
    await capture(page, 'hub');
  } finally {
    await database.pool.query('delete from post_targets where store_id=$1', [storeId]);
    await database.pool.query('delete from posts where store_id=$1', [storeId]);
    await database.pool.query('delete from channel_connections where store_id=$1', [storeId]);
    await database.pool.end();
  }
});
