import { randomUUID } from 'node:crypto';

import { test, expect } from '@playwright/test';

import type { SessionContext } from '@dakly/contracts/sessions';
import { createDatabase } from '@dakly/db/client';

// The stream is not built yet, so this checks a stored card after load, not live delivery.
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
