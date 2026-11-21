import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test, expect, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

const evidence = resolve(process.cwd(), '../../docs/design/evidence/chn-7-sms-settings');
const rulesEvidence = resolve(process.cwd(), '../../docs/design/evidence/chn-10-sms-rules');

async function capture(page: Page, name: string, directory = evidence) {
  await mkdir(directory, { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.mouse.move(width - 1, height - 1);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(0);
    // A toast from an earlier save would cover the page; the rules card sits below the fold.
    await page.evaluate(() =>
      document.querySelectorAll<HTMLElement>('[aria-label="Dismiss"]').forEach((b) => b.click()),
    );
    await page.screenshot({
      path: resolve(directory, `${name}-${width}x${height}.png`),
      fullPage: directory === rulesEvidence,
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
    await expect(page.getByText('Brand name · customers see Dhaka Wear')).toBeVisible();
    await capture(page, 'approved');
  } finally {
    await database.pool.query('delete from sms_sender_ids where store_id=$1', [storeId]);
    await database.pool.query('delete from files where store_id=$1', [storeId]);
    await database.pool.end();
  }
});

test('shows the SMS balance and saves the sending rules', async ({ page, context, baseURL }) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const storeId = fixture.storeIds[0];
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const ledgerId = randomUUID();
  try {
    await database.pool.query(
      "insert into wallet_ledger(id,store_id,wallet,revision,kind,quantity_delta,balance_quantity_after,idempotency_key,actor_type) values($1::uuid,$2,'sms_credits',1,'top_up',12400,12400,$1::text,'system')",
      [ledgerId, storeId],
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
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/settings?tab=sms');
    await expect(page.getByText('12,400 SMS')).toBeVisible();
    await expect(page.getByText(/About 6,200 Bangla messages/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sending rules', level: 2 })).toBeVisible();
    await expect(page.getByLabel('Pause from')).toHaveValue('21:00');
    await expect(page.getByLabel('Start again at')).toHaveValue('09:00');
    await expect(page.getByLabel('Most SMS per day')).toHaveValue('2000');
    await capture(page, 'rules-default', rulesEvidence);

    await page.getByLabel('Most SMS per day').fill('1500');
    await page.getByLabel('Most SMS per day').blur();
    await expect(page.getByText('Sending rules saved.', { exact: true })).toBeVisible();
    await page.getByRole('switch', { name: 'Don’t send at night' }).click();
    await expect(page.getByLabel('Pause from')).toBeHidden();
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Don’t send at night' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expect(page.getByLabel('Most SMS per day')).toHaveValue('1500');
    await capture(page, 'rules-night-pause-off', rulesEvidence);

    await page.getByRole('switch', { name: 'Don’t send at night' }).click();
    await page.getByLabel('Pause from').fill('18:30');
    await page.getByLabel('Pause from').blur();
    await expect(
      page.getByText('Choose a time on the hour from 8:00 pm to 10:00 pm.'),
    ).toBeVisible();
    await capture(page, 'rules-time-error', rulesEvidence);
  } finally {
    await database.pool.query('delete from wallet_ledger where id=$1', [ledgerId]);
    await database.pool.query(`update stores set settings = settings - 'sending' where id=$1`, [
      storeId,
    ]);
    await database.pool.end();
  }
});
