import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('reads the comments on a post and says so when a comment cannot be hidden', async ({
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
  const connectionId = randomUUID();
  const postId = randomUUID();
  const targetId = randomUUID();
  const externalPostId = `${connectionId}_1`;
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
  const people = [
    ['Rumana Akter', 'Price koto?', 95],
    ['Habib Rahman', 'M size ache?', 70],
    ['Lamia Haque', 'Dhaka te delivery koto din lage?', 41],
  ] as const;
  try {
    await database.pool.query("update stores set extensions = array['chats'] where id = $1", [
      storeId,
    ]);
    await database.pool.query(
      `insert into channel_connections (id, store_id, kind, external_account_id, display_name)
       values ($1::uuid, $2, 'facebook_page', $1::text, 'Urban Trend')`,
      [connectionId, storeId],
    );
    await database.pool.query('insert into posts (id, store_id, caption) values ($1, $2, $3)', [
      postId,
      storeId,
      'Women’s Kurti, soft cotton. ৳850, M L XL.',
    ]);
    await database.pool.query(
      `insert into post_targets (id, store_id, post_id, channel_connection_id, status, external_post_id)
       values ($1, $2, $3, $4, 'published', $5)`,
      [targetId, storeId, postId, connectionId, externalPostId],
    );
    for (const [index, [name, body, minutes]] of people.entries())
      await database.pool.query(
        `insert into social_comments (id, store_id, channel_connection_id, external_post_id,
           external_comment_id, author_name, body, status, private_replied_at, commented_at,
           post_target_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          randomUUID(),
          storeId,
          connectionId,
          externalPostId,
          `comment-${index}`,
          name,
          body,
          index === 2 ? 'replied' : 'new',
          index === 2 ? minutesAgo(30) : null,
          minutesAgo(minutes),
          targetId,
        ],
      );
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
          headers: { Origin: baseURL! },
          data: { storeId },
        })
      ).status(),
    ).toBe(204);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/chats?channel=comments&post=missing-post');
    await page.getByRole('link', { name: 'All posts' }).click();
    await expect(page).toHaveURL(/channel=comments$/);

    await expect(page.getByRole('link', { name: /Women’s Kurti/ })).toBeVisible();
    await capture(page, 'posts');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('link', { name: /Women’s Kurti/ }).click();
    await expect(page).toHaveURL(/post=/);
    await expect(page.getByRole('heading', { name: /Women’s Kurti/ })).toBeVisible();
    await expect(page.getByText('Price sent in Messenger')).toBeVisible();
    await capture(page, 'post-thread');

    await page.getByRole('button', { name: 'Send price by Messenger' }).first().click();
    await expect(page.getByRole('textbox', { name: 'Private message' })).toBeVisible();
    await capture(page, 'private-reply');
    await page.getByRole('button', { name: 'Cancel' }).click();

    // The fixture Page has no saved credential, so Meta is never reached and the action fails.
    await page.getByRole('button', { name: 'Hide comment' }).first().click();
    await expect(page.getByRole('alert').filter({ hasText: /connect/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide comment' }).first()).toBeEnabled();
  } finally {
    for (const table of ['audit_log', 'social_comments', 'post_targets'])
      await database.pool.query(`delete from ${table} where store_id = $1`, [storeId]);
    await database.pool.query('delete from posts where id = $1', [postId]);
    await database.pool.query('delete from channel_connections where id = $1', [connectionId]);
    await database.pool.end();
  }
});

async function capture(page: Page, screen: string) {
  const evidence = process.env.CHAT6_SCREENSHOT_DIR;
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: resolve(evidence, `${screen}-${width}.png`) });
  }
}
