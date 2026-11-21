import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test, expect, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

const evidence = resolve(process.cwd(), '../../docs/design/evidence/chn-7-sms-settings');

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
      path: resolve(evidence, `${name}-${width}x${height}.png`),
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('requests a sender name with a trade licence and an NID, and shows its status', async ({
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
    await page.goto('/settings?tab=sms');
    await expect(page.getByRole('heading', { name: 'Sender name', level: 2 })).toBeVisible();
    await expect(page.getByText('Dakly shared sender')).toBeVisible();
    await capture(page, 'shared-sender');

    await page.getByRole('button', { name: 'Request a sender name' }).click();
    const dialog = page.getByRole('dialog', { name: 'Request a sender name' });
    await expect(dialog).toBeVisible();
    await capture(page, 'request-empty');

    await dialog.getByLabel('Sender name', { exact: true }).fill('Dhaka Wear');
    await dialog.getByLabel('Trade licence', { exact: true }).setInputFiles({
      name: 'licence.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 licence'),
    });
    await expect(dialog.getByText('licence.pdf uploaded.')).toBeVisible();
    await dialog.getByLabel('NID of the owner', { exact: true }).setInputFiles({
      name: 'nid.png',
      mimeType: 'image/png',
      buffer: Buffer.from([137, 80, 78, 71]),
    });
    await expect(dialog.getByText('nid.png uploaded.')).toBeVisible();
    await dialog.getByRole('checkbox').check();
    await capture(page, 'request-filled');

    await dialog.getByRole('button', { name: 'Send request' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Requested', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request a sender name' })).toBeDisabled();
    await capture(page, 'requested');

    await database.pool.query(
      "update sms_sender_ids set status='approved', decided_at=now() where store_id=$1",
      [storeId],
    );
    await page.reload();
    await expect(page.getByText('Brand name · customers see DHAKA WEAR')).toBeVisible();
    await capture(page, 'approved');
  } finally {
    await database.pool.query('delete from sms_sender_ids where store_id=$1', [storeId]);
    await database.pool.query('delete from files where store_id=$1', [storeId]);
    await database.pool.end();
  }
});
