import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test, expect, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

const samplePhoto =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const evidence = process.env.SOC5_MY_POSTS_EVIDENCE;

async function capture(page: Page, name: string) {
  if (!evidence) return;
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
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

// Times are Dhaka (UTC+6) on the day shown on the calendar.
type Seed = {
  caption: string | null;
  day: string;
  time: string;
  accounts: ('page' | 'instagram')[];
  kind?: 'post' | 'story';
  published?: [number, number, number, number];
};

const seeds: Seed[] = [
  {
    caption: 'Our winter kurti collection is here, cash on delivery',
    day: '2026-11-02',
    time: '20:30',
    accounts: ['page', 'instagram'],
  },
  {
    caption: 'Leather sandals, handmade in Dhaka',
    day: '2026-11-03',
    time: '20:30',
    accounts: ['instagram'],
  },
  {
    caption: 'নতুন কটন পাঞ্জাবি এসেছে, অর্ডার করুন',
    day: '2026-11-04',
    time: '13:00',
    accounts: ['page'],
  },
  {
    caption: 'Handwoven scarves back in stock',
    day: '2026-11-05',
    time: '20:30',
    accounts: ['instagram'],
  },
  {
    caption: 'Weekend sale starts tonight',
    day: '2026-11-07',
    time: '12:30',
    accounts: ['page', 'instagram'],
  },
  { caption: null, day: '2026-11-08', time: '20:30', accounts: ['instagram'], kind: 'story' },
  {
    caption: 'Kids party wear for Eid gatherings',
    day: '2026-11-10',
    time: '20:30',
    accounts: ['page'],
  },
  {
    caption: '11.11 Mega sale, up to 30 percent off',
    day: '2026-11-11',
    time: '09:00',
    accounts: ['page', 'instagram'],
  },
  {
    caption: 'Last hours of the 11.11 sale',
    day: '2026-11-11',
    time: '20:00',
    accounts: ['page', 'instagram'],
  },
  {
    caption: 'Mustard silk scarves are back',
    day: '2026-10-28',
    time: '19:00',
    accounts: ['page'],
    published: [4210, 318, 41, 96],
  },
  {
    caption: 'Navy or maroon? Our new cotton Panjabi',
    day: '2026-10-30',
    time: '12:30',
    accounts: ['page'],
    published: [1860, 142, 12, 31],
  },
  {
    caption: 'Pohela Falgun gift boxes',
    day: '2026-10-25',
    time: '20:30',
    accounts: ['page', 'instagram'],
    published: [9120, 804, 77, 0],
  },
  {
    caption: 'Behind the scenes at our Mirpur workshop',
    day: '2026-10-22',
    time: '17:00',
    accounts: ['page'],
    published: [620, 58, 4, 0],
  },
];

test('shows scheduled and published posts on a calendar', async ({ page, context, baseURL }) => {
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
         (gen_random_uuid(),$1,'facebook_page','3001001','Urban Trend','active',null),
         (gen_random_uuid(),$1,'instagram','3001002','@urbantrend.bd','needs_reconnect','2026-11-05T06:00:00Z')
       returning id, kind`,
      [storeId],
    );
    const ids = {
      page: accounts.rows.find(({ kind }) => kind === 'facebook_page')!.id,
      instagram: accounts.rows.find(({ kind }) => kind === 'instagram')!.id,
    };
    const photo = await database.pool.query<{ id: string }>(
      "insert into files(id,store_id,purpose,object_key,content_type,size_bytes,status) values(gen_random_uuid(),$1,'post_media','posts/calendar.jpg','image/jpeg',70,'ready') returning id",
      [storeId],
    );
    for (const seed of seeds) {
      const at = new Date(`${seed.day}T${seed.time}:00+06:00`);
      const post = await database.pool.query<{ id: string }>(
        'insert into posts(id,store_id,kind,caption,created_by_user_id,created_at,updated_at,media_file_ids) values(gen_random_uuid(),$1,$2,$3,$4,$5,$5,$6) returning id',
        [storeId, seed.kind ?? 'post', seed.caption, userId, at, [photo.rows[0]!.id]],
      );
      for (const account of seed.accounts) {
        const [reach, reactions, comments, linkTaps] = seed.published ?? [null, null, null, null];
        await database.pool.query(
          `insert into post_targets(id,store_id,post_id,channel_connection_id,status,scheduled_for,published_at,external_post_id,reach,reactions,comments,link_taps)
           values(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            storeId,
            post.rows[0]!.id,
            ids[account],
            seed.published ? 'published' : 'scheduled',
            at,
            seed.published ? at : null,
            seed.published ? `ext-${post.rows[0]!.id}-${account}` : null,
            reach,
            reactions,
            comments,
            linkTaps,
          ],
        );
      }
    }
    await page.route('**/posts/calendar.jpg*', (route) =>
      route.fulfill({ contentType: 'image/png', body: Buffer.from(samplePhoto, 'base64') }),
    );
    // The design was captured on 6 Nov 2026; fix the browser clock so today matches it.
    await page.clock.setFixedTime(new Date('2026-11-06T10:00:00+06:00'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/social/posts');
    await expect(page.getByRole('heading', { name: 'My posts', level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Reconnect @urbantrend.bd' })).toContainText(
      /\d+ scheduled Instagram posts/,
    );
    await capture(page, 'month');

    await page.getByRole('button', { name: 'Week', exact: true }).click();
    await expect(page).toHaveURL(/view=week/);
    await capture(page, 'week');
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await capture(page, 'list');

    // A phone starts on the list, because the month grid is too small to read.
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/social/posts');
    await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  } finally {
    await database.pool.query('delete from post_targets where store_id=$1', [storeId]);
    await database.pool.query('delete from posts where store_id=$1', [storeId]);
    await database.pool.query('delete from files where store_id=$1', [storeId]);
    await database.pool.query('delete from channel_connections where store_id=$1', [storeId]);
    await database.pool.end();
  }
});
