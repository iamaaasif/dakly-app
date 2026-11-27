import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('downloads the filtered Orders pipeline and fits the Export menu on desktop and phone', async ({
  context,
  page,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as { token: string; storeIds: string[] };
  const storeId = fixture.storeIds[0]!;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const productId = randomUUID();
  const variantId = randomUUID();
  const orderId = randomUUID();
  const evidence = [
    resolve(process.cwd(), '../../docs/design/evidence/ord-10-export'),
    resolve(process.cwd(), 'e2e-artifacts/ord-10-export'),
  ];
  for (const directory of evidence) await mkdir(directory, { recursive: true });

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
    const { contextTag } = await (await context.request.get('/api/me/context')).json();
    const selected = await context.request.post('/api/me/active-store', {
      data: { storeId },
      headers: { Origin: baseURL!, 'X-Session-Context': contextTag },
    });
    expect(selected.status()).toBe(204);

    await database.pool.query(
      "insert into products(id,store_id,name) values($1,$2,'Cotton Panjabi')",
      [productId, storeId],
    );
    await database.pool.query(
      "insert into product_variants(id,store_id,product_id,title) values($1,$2,$3,'L')",
      [variantId, storeId, productId],
    );
    await database.pool.query(
      `insert into orders(id,store_id,number,source,created_by_type,buyer_name,recipient_name,
        recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,cod_amount_poisha)
      values($1,$2,1520,'manual','user','Nusrat Jahan','Samina Jahan','01701000001','Mirpur','Dhaka',125000,125000)`,
      [orderId, storeId],
    );
    await database.pool.query(
      `insert into order_items(id,store_id,order_id,variant_id,product_name,variant_title,
        quantity,unit_price_poisha,is_stock_tracked)
      values($1,$2,$3,$4,'Cotton Panjabi','L',1,125000,false)`,
      [randomUUID(), storeId, orderId, variantId],
    );

    await page.goto('/orders?stage=to_confirm&source=manual&search=Nusrat');
    await expect(page.getByText('Cotton Panjabi (L) × 1')).toBeVisible();
    const trigger = page.getByRole('button', { name: 'Export', exact: true });
    for (const [width, height, format] of [
      [1440, 900, 'csv'],
      [360, 800, 'xlsx'],
    ] as const) {
      await page.setViewportSize({ width, height });
      await trigger.press('Enter');
      await expect(page.getByRole('menuitem', { name: 'CSV' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Excel (.xlsx)' })).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
      for (const directory of evidence)
        await page.screenshot({
          path: resolve(directory, `orders-export-${width}x${height}.png`),
          animations: 'disabled',
        });

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('menuitem', { name: format === 'csv' ? 'CSV' : 'Excel (.xlsx)' }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(new RegExp(`^dakly-orders-.*\\.${format}$`));
      expect(await download.failure()).toBeNull();
      await expect(page.getByRole('status').filter({ hasText: 'Exported 1 row.' })).toBeVisible();
      if (format === 'csv')
        expect(await readFile((await download.path())!, 'utf8')).toContain(
          '"Nusrat Jahan","Samina Jahan","01701000001","Dhaka","Cotton Panjabi","L"',
        );
    }
  } finally {
    await database.pool.query('delete from orders where store_id=$1 and id=$2', [storeId, orderId]);
    await database.pool.query('delete from product_variants where store_id=$1 and id=$2', [
      storeId,
      variantId,
    ]);
    await database.pool.query('delete from products where store_id=$1 and id=$2', [
      storeId,
      productId,
    ]);
    await database.pool.end();
  }
});
