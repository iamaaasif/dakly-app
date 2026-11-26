import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test('opens the saved invoice in a new tab and prints the loaded order', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as { token: string; storeIds: string[] };
  const storeId = fixture.storeIds[0]!;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const orderId = randomUUID();
  const productId = randomUUID();
  const variantId = randomUUID();
  const evidence = resolve(process.cwd(), '../../docs/design/evidence/ord-10-invoice');

  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  await context.addInitScript(() => {
    window.print = () => {
      const heading = document.querySelector('article h1')?.textContent ?? 'Invoice not loaded';
      const previous = document.documentElement.dataset.printedInvoice;
      document.documentElement.dataset.printedInvoice = previous ? 'Printed again' : heading;
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
    const originalStore = await database.pool.query<{
      name: string;
      phone: string | null;
      time_zone: string;
    }>('select name, phone, time_zone from stores where id=$1', [storeId]);
    const { name, phone, time_zone: timeZone } = originalStore.rows[0]!;
    await database.pool.query(
      "update stores set name='Aarong Road Shop', phone='01701000015', time_zone='Asia/Dhaka' where id=$1",
      [storeId],
    );

    try {
      await database.pool.query(
        "insert into products (id,store_id,name,price_poisha) values ($1,$2,'Renamed Panjabi',145000)",
        [productId, storeId],
      );
      await database.pool.query(
        "insert into product_variants (id,store_id,product_id,title) values ($1,$2,$3,'L')",
        [variantId, storeId, productId],
      );
      await database.pool.query(
        `insert into orders (id,store_id,number,source,created_by_type,stage,buyer_name,recipient_name,
          recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,delivery_charge_poisha,
          order_discount_poisha,advance_paid_poisha,cod_amount_poisha,created_at)
          values ($1,$2,1054,'manual','user','to_confirm','Nusrat Jahan','Farhana Islam','01801000028',
            'House 14, Block C, Mirpur','Dhaka',249100,6000,9000,20000,226100,'2026-11-25T20:00:00Z')`,
        [orderId, storeId],
      );
      await database.pool.query(
        `insert into order_items (id,store_id,order_id,variant_id,product_name,variant_title,quantity,
          unit_price_poisha,line_discount_poisha,is_stock_tracked)
          values ($1,$2,$3,$4,'Cotton Panjabi','M',2,125050,1000,false)`,
        [randomUUID(), storeId, orderId, variantId],
      );

      await page.goto(`/orders?selected=${orderId}`);
      const drawer = page.getByRole('dialog', { name: 'Order #1054' });
      const [invoice] = await Promise.all([
        context.waitForEvent('page'),
        drawer.getByRole('link', { name: 'Print invoice' }).click(),
      ]);
      await expect(invoice).toHaveURL(`/orders/${orderId}/print#print`);
      await expect(invoice.locator('html')).toHaveAttribute(
        'data-printed-invoice',
        'Invoice #1054',
      );
      await expect(invoice.getByRole('row', { name: /Cotton Panjabi/ })).toContainText('৳1,250.50');
      await expect(invoice.getByText('৳2,261', { exact: true })).toBeVisible();
      await expect(invoice.getByText('Thursday, 26 November 2026')).toBeVisible();

      await mkdir(evidence, { recursive: true });
      for (const [width, height] of [
        [1440, 900],
        [360, 800],
      ] as const) {
        await invoice.setViewportSize({ width, height });
        await expect
          .poll(() => invoice.evaluate(() => document.documentElement.scrollWidth))
          .toBeLessThanOrEqual(width);
        await invoice.screenshot({
          path: resolve(evidence, `invoice-${width}x${height}.png`),
          animations: 'disabled',
        });
      }

      await invoice.setViewportSize({ width: 794, height: 1123 });
      await invoice.emulateMedia({ media: 'print' });
      await expect(invoice.getByRole('button', { name: 'Print invoice' })).toBeHidden();
      await expect(invoice.getByRole('heading', { name: 'Invoice #1054' })).toBeVisible();
      await invoice.screenshot({
        path: resolve(evidence, 'invoice-print.png'),
        animations: 'disabled',
      });
      const pdf = await invoice.pdf({
        path: test.info().outputPath('invoice.pdf'),
        preferCSSPageSize: true,
      });
      const pages = [...pdf.toString('latin1').matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
      expect(pages).toHaveLength(1);
      const [, width, height] = pages[0]!;
      expect([Math.round(Number(width)), Math.round(Number(height))]).toEqual([595, 842]);
    } finally {
      await database.pool.query('delete from orders where id=$1', [orderId]);
      await database.pool.query('delete from product_variants where id=$1', [variantId]);
      await database.pool.query('delete from products where id=$1', [productId]);
      await database.pool.query('update stores set name=$2,phone=$3,time_zone=$4 where id=$1', [
        storeId,
        name,
        phone,
        timeZone,
      ]);
    }
  } finally {
    await database.pool.end();
  }
});
