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

test('connects a Page and an Instagram account with the fake Meta driver, reconnects and disconnects', async ({
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

    await page.getByRole('button', { name: 'Connect Facebook Page' }).click();
    await expect(page.getByRole('dialog', { name: 'Connect Facebook Page' })).toBeVisible();
    await capture(page, 'connect-intro');

    // Hold the account list so the waiting state can be photographed.
    let release!: () => void;
    const held = new Promise<void>((resolveHeld) => (release = resolveHeld));
    await page.route('**/api/channel-connections/meta/accounts', async (route) => {
      await held;
      await route.continue();
    });
    await page.getByRole('button', { name: 'Continue with Facebook' }).click();
    await expect(page.getByRole('dialog', { name: 'Waiting for Facebook…' })).toBeVisible();
    await capture(page, 'waiting');
    release();

    const choose = page.getByRole('dialog', { name: 'Choose Pages' });
    await expect(choose).toBeVisible();
    await expect(choose.getByText('করিমের দোকান')).toBeVisible();
    await capture(page, 'choose-pages');
    await choose.getByLabel('রিনার দোকান').check();
    await choose.getByRole('button', { name: 'Connect' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Facebook Page connected.' }),
    ).toBeVisible();
    const messenger = page.getByRole('region', { name: 'Messenger' });
    await expect(messenger.getByText('রিনার দোকান')).toBeVisible();
    await expect(messenger.getByText('Connected', { exact: true })).toBeVisible();
    await capture(page, 'connected-page');

    await page.getByRole('button', { name: 'Connect Instagram' }).click();
    await page.getByRole('button', { name: 'Continue with Facebook' }).click();
    const accounts = page.getByRole('dialog', { name: 'Choose Instagram accounts' });
    await expect(accounts.getByText('rinas_shop')).toBeVisible();
    await accounts.getByLabel('rinas_shop').check();
    await accounts.getByRole('button', { name: 'Connect' }).click();
    const instagram = page.getByRole('region', { name: 'Instagram' });
    await expect(instagram.getByText('rinas_shop')).toBeVisible();
    await expect(page.getByText('2 connected')).toBeVisible();

    await database.pool.query(
      "update channel_connections set status='needs_reconnect' where store_id=$1 and kind='facebook_page'",
      [storeId],
    );
    await page.reload();
    await expect(messenger.getByText('Needs reconnect')).toBeVisible();
    await capture(page, 'needs-reconnect');
    await messenger.getByRole('button', { name: 'Reconnect' }).click();
    await page.getByRole('button', { name: 'Continue with Facebook' }).click();
    const again = page.getByRole('dialog', { name: 'Choose Pages' });
    await expect(again.getByLabel('রিনার দোকান')).toBeChecked();
    await again.getByRole('button', { name: 'Connect' }).click();
    await expect(messenger.getByText('Connected', { exact: true })).toBeVisible();

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
