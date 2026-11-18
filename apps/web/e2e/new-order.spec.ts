import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

const evidence = resolve(process.cwd(), '../../docs/design/evidence/ord-5-new-order');

async function capture(page: Page, name: string) {
  await mkdir(evidence, { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.mouse.move(width - 1, height - 1);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    if (name !== 'pipeline') {
      if (width === 1440) {
        await page
          .locator('dialog[open] form > div.overflow-y-auto')
          .evaluate((node) => node.scrollTo({ top: 0 }));
      }
      if (width === 360) {
        await page.getByText('Cash on delivery').scrollIntoViewIfNeeded();
        await expect(page.getByRole('button', { name: 'Save order' })).toBeInViewport();
      }
      await expect
        .poll(() =>
          page
            .locator('dialog[open]')
            .evaluate((dialog) => dialog.scrollWidth - dialog.clientWidth),
        )
        .toBe(0);
    }
    await page.screenshot({
      path: resolve(evidence, `${name}-${width}.png`),
      animations: 'disabled',
    });
  }
}

test('creates a staff order with the zone charge, stock and computed COD', async ({
  page,
  context,
  baseURL,
}) => {
  page.setDefaultTimeout(8000);
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as { token: string; storeIds: string[] };
  const storeId = fixture.storeIds[0]!;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const productId = `0${randomUUID().slice(1)}`;
  const otherProducts = Array.from({ length: 50 }, () => `f${randomUUID().slice(1)}`);
  const variantId = randomUUID();
  const zoneId = randomUUID();
  let insertedCounter = false;
  let existingBuyerId: string | undefined;
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  try {
    const current = await context.request.get('/api/me/context');
    const { contextTag } = await current.json();
    const selected = await context.request.post('/api/me/active-store', {
      data: { storeId },
      headers: { Origin: baseURL!, 'X-Session-Context': contextTag },
    });
    expect(selected.status()).toBe(204);
    const counter = await database.pool.query(
      'insert into store_counters (store_id) values ($1) on conflict do nothing returning store_id',
      [storeId],
    );
    insertedCounter = counter.rowCount === 1;
    await database.pool.query(
      "insert into products (id,store_id,name,price_poisha) values ($1,$2,'Cotton Panjabi',125000)",
      [productId, storeId],
    );
    await database.pool.query(
      `insert into products (id,store_id,name,price_poisha)
       select id,$1,'Catalogue product ' || number,1000
       from unnest($2::uuid[]) with ordinality as catalogue(id, number)`,
      [storeId, otherProducts],
    );
    await database.pool.query(
      "insert into product_variants (id,store_id,product_id,title,on_hand) values ($1,$2,$3,'M',5)",
      [variantId, storeId, productId],
    );
    await database.pool.query(
      "insert into delivery_zones (id,store_id,name,charge_poisha,bd_area_ids) values ($1,$2,'Inside Dhaka',6000,ARRAY[301])",
      [zoneId, storeId],
    );
    await page.goto('/orders');
    await expect(page.getByRole('button', { name: 'New order' })).toBeVisible();
    await capture(page, 'pipeline');
    await page.getByRole('button', { name: 'New order' }).click();
    const create = page.getByRole('dialog', { name: 'New order' });
    await create.getByLabel('Buyer name').fill('Rahim Ahmed');
    const gift = create.getByLabel('Deliver to someone else');
    const recipientPhone = create.getByLabel('Recipient phone');
    await recipientPhone.fill('01701000014');
    await gift.check();
    await expect(recipientPhone).toHaveValue('');
    await create.getByLabel('Recipient name').fill('Karim Ahmed');
    await recipientPhone.fill('01701000015');
    await create.getByLabel('Address').fill('House 14, Mirpur');
    await create.getByRole('button', { name: 'Save order' }).click();
    await expect(create.getByText('Choose a district or upazila')).toBeVisible();
    await expect(create.getByLabel('District')).toHaveAttribute('aria-invalid', 'true');
    await create.getByLabel('Division').selectOption({ label: 'Dhaka' });
    await create.getByLabel('District').selectOption({ label: 'Dhaka' });
    await expect(create.getByLabel('Delivery charge (৳)')).toHaveAttribute('placeholder', '60');
    const variant = create.getByLabel('Product and variant 1');
    await expect(variant.getByRole('option', { name: 'Cotton Panjabi · M' })).toHaveCount(0);
    await create.getByRole('button', { name: 'Load more products' }).click();
    await variant.selectOption({ label: 'Cotton Panjabi · M' });
    await expect(variant).toHaveAttribute('aria-invalid', 'false');
    await expect(create.getByText('5 in stock')).toBeVisible();
    await expect(create.getByText('৳1,310')).toBeVisible();
    await create.getByRole('button', { name: 'Add product' }).click();
    await expect(create.getByText('Cash on delivery')).toHaveCount(0);
    await create.getByRole('button', { name: 'Remove' }).last().click();
    const search = create.getByLabel('Search products');
    await search.fill('Missing product');
    await expect(create.getByText('5 in stock')).toBeVisible();
    await expect(create.getByText('৳1,310')).toBeVisible();
    await search.clear();
    await create.getByLabel('Delivery charge (৳)').fill('90.25');
    await expect(create.getByText('৳1,340.25')).toBeVisible();
    await capture(page, 'new');
    let firstKey: string | undefined;
    let firstBody: string | null;
    await page.route('**/api/orders', async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.continue();
      const key = request.headers()['idempotency-key'];
      if (firstKey) {
        expect(key).toBe(firstKey);
        expect(request.postData()).toBe(firstBody);
        return route.continue();
      }
      firstKey = key;
      firstBody = request.postData();
      expect(firstKey).toBeTruthy();
      const saved = await route.fetch();
      expect(saved.status()).toBe(201);
      await route.abort();
    });
    await create.getByRole('button', { name: 'Save order' }).click();
    await expect(create.getByText('Could not confirm the save')).toBeVisible();
    await expect(recipientPhone).toBeDisabled();
    await create.getByRole('button', { name: 'Retry save' }).click();
    const detail = page.getByRole('dialog', { name: /^Order #/ });
    await expect(detail.getByText('Karim Ahmed', { exact: true })).toBeVisible();
    await expect(detail.getByText('Buyer Rahim Ahmed')).toBeVisible();
    await expect(detail.getByRole('status', { name: 'Order stage' })).toHaveText('To confirm');
    await expect(detail.getByText('৳1,340.25').first()).toBeVisible();
    await page.unroute('**/api/orders');

    await detail.getByRole('button', { name: 'Close', exact: true }).click();
    const storeContext = await context.request.get('/api/me/context');
    const { contextTag: storeTag } = await storeContext.json();
    const buyer = await context.request.post('/api/contacts', {
      data: { name: 'Sonia Akter', phone: '01701000024' },
      headers: { Origin: baseURL!, 'X-Session-Context': storeTag },
    });
    expect(buyer.status()).toBe(201);
    const { id: buyerId } = await buyer.json();
    existingBuyerId = buyerId;
    await page.getByRole('button', { name: 'New order' }).click();
    await create.getByLabel('Find a customer').fill('Sonia Akter');
    await create.getByRole('button', { name: /Sonia Akter/ }).click();
    await expect(recipientPhone).toHaveValue('01701000024');
    await gift.check();
    await expect(recipientPhone).toHaveValue('');
    await create.getByLabel('Recipient name').fill('Nusrat Akter');
    await recipientPhone.fill('01701000025');
    await create.getByLabel('Address').fill('Road 4, Dhanmondi');
    await create.getByLabel('Division').selectOption({ label: 'Dhaka' });
    await create.getByLabel('District').selectOption({ label: 'Dhaka' });
    await expect(create.getByLabel('Delivery charge (৳)')).toHaveAttribute('placeholder', '60');
    await create.getByLabel('Product and variant 1').selectOption({ label: 'Cotton Panjabi · M' });
    await expect(create.getByText('4 in stock')).toBeVisible();
    await create.getByLabel('Discount (৳)').fill('50');
    await expect(create.getByText(/^Total/).getByText('৳1,260', { exact: true })).toBeVisible();
    await create.getByLabel('Discount (৳)').clear();
    await create.getByLabel('Advance paid (৳)').fill('200');
    await expect(
      create.getByText(/^Cash on delivery/).getByText('৳1,110', { exact: true }),
    ).toBeVisible();
    await capture(page, 'buyer-and-advance');
    await create.getByRole('button', { name: 'Save as confirmed' }).click();
    await expect(detail.getByText('Nusrat Akter', { exact: true })).toBeVisible();
    await expect(detail.getByRole('link', { name: 'Open profile' })).toHaveAttribute(
      'href',
      `/customers/${buyerId}`,
    );
    await expect(detail.getByText('To confirm → To pack')).toBeVisible();
    await expect(detail.getByText('৳1,110')).toBeVisible();
  } finally {
    const orders = await database.pool.query<{ id: string; buyer_contact_id: string | null }>(
      'select id,buyer_contact_id from orders where store_id=$1 and delivery_zone_id=$2',
      [storeId, zoneId],
    );
    const ids = orders.rows.map((order) => order.id);
    const buyerIds = orders.rows.flatMap(({ buyer_contact_id }) => buyer_contact_id ?? []);
    if (existingBuyerId) buyerIds.push(existingBuyerId);
    await database.pool.query(
      `delete from outbox_events where store_id=$1 and
       (payload->>'orderId' = any($2::text[]) or payload->>'variantId'=$3 or payload->>'contactId' = any($4::text[]))`,
      [storeId, ids, variantId, buyerIds],
    );
    await database.pool.query('delete from orders where store_id=$1 and id=any($2::uuid[])', [
      storeId,
      ids,
    ]);
    await database.pool.query('delete from contacts where store_id=$1 and id=any($2::uuid[])', [
      storeId,
      buyerIds,
    ]);
    await database.pool.query('delete from stock_movements where store_id=$1 and variant_id=$2', [
      storeId,
      variantId,
    ]);
    await database.pool.query('delete from product_variants where store_id=$1 and id=$2', [
      storeId,
      variantId,
    ]);
    await database.pool.query('delete from products where store_id=$1 and id=any($2::uuid[])', [
      storeId,
      [productId, ...otherProducts],
    ]);
    await database.pool.query('delete from delivery_zones where store_id=$1 and id=$2', [
      storeId,
      zoneId,
    ]);
    if (insertedCounter)
      await database.pool.query('delete from store_counters where store_id=$1', [storeId]);
    await database.pool.end();
  }
});
