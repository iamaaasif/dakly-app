import { randomUUID } from 'node:crypto';

import { test, expect } from '@playwright/test';

import type { SessionContext } from '@dakly/contracts/sessions';
import { createDatabase } from '@dakly/db/client';

test('shows a stored notification in the bell and list and marks it done', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as { token: string };
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  const session = (await (await context.request.get('/api/me/context')).json()) as SessionContext;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const notificationId = randomUUID();
  try {
    await database.pool.query(
      "insert into notifications(id,store_id,user_id,category,type,title,dedupe_key) values($1,$2,$3,'fix_now','channel.needs_reconnect','Reconnect your Facebook page',$4)",
      [notificationId, session.currentStore!.storeId, session.user.id, `e2e:${notificationId}`],
    );
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Open notifications, 1 unread' }).click();
    await expect(page).toHaveURL(/notifications=all/);
    await page.getByRole('button', { name: 'Fix now' }).click();
    await expect(page).toHaveURL(/notifications=fix_now/);
    const sheet = page.getByRole('dialog', { name: 'Notifications' });
    await expect(sheet.getByText('Reconnect your Facebook page')).toBeVisible();
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await sheet.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await sheet.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(sheet.getByText('Done', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open notifications, 0 unread' })).toBeVisible();
    const stored = await database.pool.query('select status from notifications where id=$1', [
      notificationId,
    ]);
    expect(stored.rows).toEqual([{ status: 'done' }]);
  } finally {
    await database.pool.query('delete from notifications where id=$1', [notificationId]);
    await database.pool.end();
  }
});

test('a notification created through the API appears in the open page without a reload', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as { token: string };
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  const session = (await (await context.request.get('/api/me/context')).json()) as SessionContext;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const notificationId = randomUUID();
  const eventId = randomUUID();
  try {
    await page.goto('/dashboard?notifications=all');
    const sheet = page.getByRole('dialog', { name: 'Notifications' });
    await expect(sheet.getByText(/Nothing here yet/)).toBeVisible();
    let loads = 0;
    page.on('load', () => {
      loads += 1;
    });
    // The same row and event NotificationsService.notify writes; the worker relays the event
    // and the API pushes the row down the open stream.
    const client = await database.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        "insert into notifications(id,store_id,user_id,category,type,title,dedupe_key) values($1,$2,$3,'fix_now','channel.needs_reconnect','Reconnect your Instagram account',$4)",
        [notificationId, session.currentStore!.storeId, session.user.id, `e2e:${notificationId}`],
      );
      await client.query(
        "insert into outbox_events(id,store_id,type,payload) values($1,$2,'notification.created',$3)",
        [
          eventId,
          session.currentStore!.storeId,
          { notificationId, userId: session.user.id, category: 'fix_now' },
        ],
      );
      await client.query('commit');
    } finally {
      client.release();
    }
    await expect(sheet.getByText('Reconnect your Instagram account')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open notifications, 1 unread' })).toBeVisible();
    expect(loads).toBe(0);
  } finally {
    await database.pool.query('delete from notifications where id=$1', [notificationId]);
    await database.pool.query('delete from outbox_events where id=$1', [eventId]);
    await database.pool.end();
  }
});
