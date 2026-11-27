import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test('keeps selected orders across stages and prints one page per label', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as { token: string; storeIds: string[] };
  const storeId = fixture.storeIds[0]!;
  const codOrderId = randomUUID();
  const paidOrderId = randomUUID();
  await page.goto(`/orders/shipping-labels/print?orderIds=${codOrderId}`);
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  await context.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printedLabels = String(
        document.querySelectorAll('.shipping-label').length,
      );
      document.documentElement.dataset.printedBarcodes = String(
        document.querySelectorAll('.shipping-label svg:has(g rect)').length,
      );
    };
  });
  try {
    const current = await context.request.get('/api/me/context');
    const { contextTag } = await current.json();
    const selected = await context.request.post('/api/me/active-store', {
      data: { storeId },
      headers: { Origin: baseURL!, 'X-Session-Context': contextTag },
    });
    expect(selected.status()).toBe(204);
    await database.pool.query(
      `insert into orders (id,store_id,number,source,created_by_type,stage,recipient_name,
         recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,
         cod_amount_poisha,payment_status)
       values ($1,$3,1056,'manual','user','to_confirm','Farhana Islam',
         '01801000028','House 14, Block C, Mirpur','Dhaka',35400,35400,'cod_pending'),
         ($2,$3,1057,'manual','user','to_pack',repeat('W',120),
         '01801000029',repeat('W',500),repeat('W',100),15000,0,'paid')`,
      [codOrderId, paidOrderId, storeId],
    );

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/orders');
    await page.getByRole('checkbox', { name: /1056.*shipping labels/ }).check();
    await page.getByRole('link', { name: /To pack/ }).click();
    await page.getByRole('checkbox', { name: /1057.*shipping labels/ }).check();
    await expect(page.getByText('2 of 100 orders selected')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('checkbox', { name: /1057.*shipping labels/ })).toBeChecked();
    await expect(page.getByText('2 of 100 orders selected')).toBeVisible();

    const [preview] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('link', { name: /Print shipping labels/ }).click(),
    ]);
    await expect(preview.locator('html')).toHaveAttribute('data-printed-labels', '2');
    await expect(preview.locator('html')).toHaveAttribute('data-printed-barcodes', '2');
    const labels = preview.getByRole('article');
    await expect(labels.nth(0)).toContainText('৳354');
    await expect(labels.nth(0)).toContainText('House 14, Block C, Mirpur');
    await expect(labels.nth(1)).toContainText('Paid');
    const evidence = resolve(process.cwd(), '../../docs/design/evidence/ord-10-labels');
    await mkdir(evidence, { recursive: true });
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await preview.setViewportSize({ width, height });
      await preview.screenshot({ path: resolve(evidence, `labels-${width}x${height}.png`) });
    }
    await expect
      .poll(() => preview.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(360);

    await preview.emulateMedia({ media: 'print' });
    await expect(preview.getByRole('button', { name: 'Print shipping labels' })).toBeHidden();
    await preview.setViewportSize({ width: 378, height: 567 });
    await preview.screenshot({ path: resolve(evidence, 'labels-print.png') });
    const pdf = await preview.pdf({ preferCSSPageSize: true });
    const pages = [...pdf.toString('latin1').matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
    expect(pages).toHaveLength(2);
    for (const [, width, height] of pages) {
      expect(Math.abs(Number(width) - (100 / 25.4) * 72)).toBeLessThan(1);
      expect(Math.abs(Number(height) - (150 / 25.4) * 72)).toBeLessThan(1);
    }
    await page.getByRole('button', { name: 'Clear selection' }).click();
    await expect(page.getByRole('checkbox', { name: /1057.*shipping labels/ })).not.toBeChecked();
    await expect(page.getByRole('link', { name: /Print shipping labels/ })).toBeHidden();
  } finally {
    await database.pool.query('delete from orders where id=any($1::uuid[])', [
      [codOrderId, paidOrderId],
    ]);
    await database.pool.end();
  }
});

test('hides shipping label actions without access to full phone numbers', async ({
  page,
  context,
  baseURL,
}) => {
  const { storeIds } = JSON.parse(process.env.BROWSER_FIXTURE!) as { storeIds: [string, string] };
  const storeId = storeIds[1];
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const orderId = randomUUID();
  const sessionId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  let membershipId: string | undefined;
  try {
    const role = await database.pool.query<{ id: string; user_id: string }>(
      "select id,user_id from memberships where store_id=$1 and built_in_role='marketer'",
      [storeId],
    );
    expect(role.rowCount).toBe(1);
    const member = role.rows[0]!;
    membershipId = member.id;
    await database.pool.query("update memberships set built_in_role='support_agent' where id=$1", [
      membershipId,
    ]);
    await database.pool.query(
      "insert into sessions(id,user_id,active_store_id,token_hash,expires_at) values($1,$2,$3,$4,now()+interval '1 hour')",
      [sessionId, member.user_id, storeId, createHash('sha256').update(token).digest()],
    );
    await database.pool.query(
      `insert into orders(id,store_id,number,source,created_by_type,stage,recipient_name,
         recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,cod_amount_poisha)
       values($1,$2,1058,'manual','user','to_confirm','Amina Rahman',
         '01801000030','Mirpur','Dhaka',35400,35400)`,
      [orderId, storeId],
    );
    await context.addCookies([
      { name: 'dakly_session', value: token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
    ]);

    await page.goto(`/orders?labelOrderIds=${orderId}`);
    await expect(page.getByText('Amina Rahman')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /shipping labels/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Print shipping labels/ })).toHaveCount(0);

    const accessMessage = page.getByText('You need full phone access to print labels');
    await page.goto('/orders/shipping-labels/print');
    await expect(accessMessage).toBeVisible();
    await page.goto(`/orders/shipping-labels/print?orderIds=${orderId}#print`);
    await expect(accessMessage).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    const evidence = resolve(process.cwd(), 'e2e-artifacts/ord-10-labels-full-phone');
    await mkdir(evidence, { recursive: true });
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.screenshot({ path: resolve(evidence, `access-${width}x${height}.png`) });
    }
    await page.emulateMedia({ media: 'print' });
    await page.screenshot({ path: resolve(evidence, 'access-print.png') });
  } finally {
    await database.pool.query('delete from orders where id=$1', [orderId]);
    await database.pool.query('delete from sessions where id=$1', [sessionId]);
    if (membershipId)
      await database.pool.query("update memberships set built_in_role='marketer' where id=$1", [
        membershipId,
      ]);
    await database.pool.end();
  }
});
