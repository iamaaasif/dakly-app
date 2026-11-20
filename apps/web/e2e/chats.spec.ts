import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

const people = [
  ['Sadia Islam', 'messenger', 'ai', 'open', 'Price koto? Mirpur e delivery charge koto?', 3],
  [
    'Mizan (Pathao rider)',
    'messenger',
    'human',
    'needs_you',
    'Bhai ami Pathao theke, apnar 3ta parcel',
    1,
  ],
  ['Rumana Akter', 'instagram', 'ai', 'open', 'eta ache? M size', 2],
  ['Habib Rahman', 'whatsapp', 'ai', 'later', 'Name Habib Rahman, address: House 12, Road 4', 1],
] as const;

test('lists chats by tab and channel and shows the tab counts', async ({
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
  const contactIds: string[] = [];
  try {
    await database.pool.query("update stores set extensions = array['chats'] where id = $1", [
      storeId,
    ]);
    await database.pool.query(
      `insert into channel_connections (id, store_id, kind, external_account_id, display_name)
       values ($1::uuid, $2, 'facebook_page', $3, 'Dhaka Threads')`,
      [connectionId, storeId, connectionId],
    );
    for (const [index, [name, channel, responder, status, preview, unread]] of people.entries()) {
      const contactId = randomUUID();
      contactIds.push(contactId);
      await database.pool.query(
        "insert into contacts (id, store_id, name, source, kind) values ($1, $2, $3, 'messenger', 'chat_only')",
        [contactId, storeId, name],
      );
      await database.pool.query(
        `insert into conversations (id, store_id, contact_id, channel_connection_id, channel, status,
           responder, unread_count, last_message_at, last_message_preview)
         values ($1, $2, $3, $4, $5, $6, $7, $8, now() - make_interval(mins => $9), $10)`,
        [
          randomUUID(),
          storeId,
          contactId,
          connectionId,
          channel,
          status,
          responder,
          unread,
          index * 30,
          preview,
        ],
      );
    }
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

    await page.goto('/chats');
    await expect(page.getByRole('link', { name: /^All\s*4$/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Needs you\s*1$/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^AI handling\s*3$/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Follow up\s*1$/ })).toBeVisible();
    await expect(page.getByText('Sadia Islam')).toBeVisible();
    await capture(page, 'all');

    await page.getByRole('link', { name: /^Needs you/ }).click();
    await expect(page).toHaveURL(/tab=needs-you/);
    await expect(page.getByText('Mizan (Pathao rider)')).toBeVisible();
    await expect(page.getByText('Sadia Islam')).toBeHidden();

    await page.getByRole('link', { name: /^All\s*4$/ }).click();
    await page.getByRole('link', { name: 'Instagram' }).click();
    await expect(page).toHaveURL(/channel=instagram/);
    await expect(page.getByText('Rumana Akter')).toBeVisible();
    await expect(page.getByText('Sadia Islam')).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  } finally {
    await database.pool.query('delete from conversations where store_id = $1', [storeId]);
    await database.pool.query('delete from contacts where id = any($1::uuid[])', [contactIds]);
    await database.pool.query('delete from channel_connections where id = $1', [connectionId]);
    await database.pool.end();
  }
});

async function capture(page: Page, screen: string) {
  const evidence = process.env.CHAT5_SCREENSHOT_DIR;
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
  await page.setViewportSize({ width: 1440, height: 900 });
}
