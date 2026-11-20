import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test, expect, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

const evidence = resolve(process.cwd(), '../../docs/design/evidence/chn-5-integrations');

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

test('lists a connected Page and disconnects it after confirmation', async ({
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
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/integrations');
    await expect(page.getByRole('heading', { name: 'Integrations', level: 1 })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'WhatsApp' }).getByText('Waiting for setup'),
    ).toBeVisible();
    await capture(page, 'empty');

    await database.pool.query(
      "insert into channel_connections(id,store_id,kind,external_account_id,display_name) values(gen_random_uuid(),$1,'facebook_page','1001001',$2)",
      [storeId, 'রিনার দোকান'],
    );
    await page.reload();
    const messenger = page.getByRole('region', { name: 'Messenger' });
    await expect(messenger.getByText('Connected', { exact: true })).toBeVisible();
    await capture(page, 'connected');

    await database.pool.query(
      "update channel_connections set status='needs_reconnect' where store_id=$1",
      [storeId],
    );
    await page.reload();
    await expect(messenger.getByText('Needs reconnect')).toBeVisible();
    await capture(page, 'needs-reconnect');

    await messenger.getByRole('button', { name: 'Disconnect' }).click();
    const confirm = page.getByRole('dialog', { name: 'Disconnect রিনার দোকান?' });
    await capture(page, 'disconnect-confirm');
    await confirm.getByRole('button', { name: 'Disconnect' }).click();
    await expect(messenger.getByText('রিনার দোকান', { exact: true })).toBeHidden();
    await expect(page.getByText('রিনার দোকান disconnected.')).toBeVisible();
  } finally {
    await database.pool.query(
      "delete from outbox_events where store_id=$1 and type like 'channel.%'",
      [storeId],
    );
    await database.pool.query('delete from channel_connections where store_id=$1', [storeId]);
    await database.pool.end();
  }
});
