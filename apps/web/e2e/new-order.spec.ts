import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import type { DeliveryZoneListResponse } from '@dakly/contracts/delivery';
import type { OrderCatalogueProduct } from '@dakly/contracts/orders';
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
    if (name === 'edit-detail') {
      await expect(page.getByRole('button', { name: 'Edit order' })).toBeInViewport();
    } else if (name !== 'pipeline') {
      const dialog = page.getByRole('dialog', {
        name: name === 'edit' ? 'Edit order' : 'New order',
      });
      if (width === 1440)
        await dialog
          .locator('form > div.overflow-y-auto')
          .evaluate((node) => node.scrollTo({ top: 0 }));
      if (width === 360) {
        await dialog.getByText('Cash on delivery').scrollIntoViewIfNeeded();
        await expect(dialog.getByRole('button', { name: 'Save order' })).toBeInViewport();
      }
      await expect
        .poll(() => dialog.evaluate((element) => element.scrollWidth - element.clientWidth))
        .toBe(0);
    }
    await page.screenshot({
      path: resolve(evidence, `${name}-${width}.png`),
      animations: 'disabled',
    });
  }
}

async function captureNewOrder(page: Page, dialog: Locator) {
  const evidence = resolve(process.cwd(), '../../docs/design/evidence/web-7-new-order');
  await mkdir(evidence, { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await dialog
      .locator('form > div.overflow-y-auto')
      .evaluate((node) => node.scrollTo({ top: 0 }));
    await expect(dialog.getByLabel('Phone', { exact: true })).toBeInViewport();
    await expect(dialog.getByRole('button', { name: 'Save order' })).toBeInViewport();
    if (width === 1440) await expect(dialog.getByText(/^Cash on delivery/)).toBeInViewport();
    await page.mouse.move(width - 1, height - 1);
    await page.screenshot({
      path: resolve(evidence, `new-order-${width}x${height}.png`),
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
  const largerVariantId = randomUUID();
  let zoneId: string | undefined;
  let zoneIds: string[] = [];
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
      "insert into product_variants (id,store_id,product_id,title,on_hand,price_override_poisha,position) values ($1,$2,$3,'L',2,190000,1)",
      [largerVariantId, storeId, productId],
    );
    await page.goto('/orders');
    await expect(page.getByRole('button', { name: 'New order' })).toBeVisible();
    await capture(page, 'pipeline');
    await page.getByRole('button', { name: 'New order' }).click();
    const create = page.getByRole('dialog', { name: 'New order' });
    await expect(create.getByLabel('Phone', { exact: true })).toBeVisible();
    await expect(create.getByLabel('Name', { exact: true })).toBeVisible();
    await expect(create.getByLabel('Buyer name')).toHaveCount(0);
    await create.getByLabel('Name', { exact: true }).fill('Rahim Ahmed');
    const gift = create.getByLabel('Deliver to someone else');
    const recipientPhone = create.getByLabel('Recipient phone');
    await create.getByLabel('Phone', { exact: true }).fill('01701000014');
    await gift.check();
    await expect(create.getByLabel('Buyer name')).toHaveValue('Rahim Ahmed');
    await expect(recipientPhone).toHaveValue('');
    await create.getByLabel('Recipient name').fill('Karim Ahmed');
    await recipientPhone.fill('01701000015');
    await create.getByLabel('Address').fill('House 14, Mirpur');
    await create.getByRole('button', { name: 'Save order' }).click();
    await expect(create.getByText('Choose a district or upazila')).toBeVisible();
    await expect(create.getByLabel('District')).toHaveAttribute('aria-invalid', 'true');
    await create.getByLabel('Division').selectOption({ label: 'Dhaka' });
    await create.getByLabel('District').selectOption({ label: 'Dhaka' });
    const zonesCreated = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/delivery-zones/initialize-defaults') &&
        response.request().method() === 'POST',
    );
    await create.getByRole('button', { name: 'Set up delivery zones' }).click();
    const zonesResponse = await zonesCreated;
    expect(zonesResponse.status()).toBe(201);
    const zones = (await zonesResponse.json()) as DeliveryZoneListResponse;
    zoneIds = zones.items.map(({ id }) => id);
    zoneId = zones.items.find(({ name }) => name === 'Inside Dhaka')?.id;
    expect(zoneId).toBeDefined();
    await expect(create.getByLabel('Delivery (৳)')).toHaveAttribute('placeholder', '60.00');
    const product = create.getByLabel('Product 1', { exact: true });
    const size = create.getByLabel('Size 1', { exact: true });
    await expect(product.getByRole('option', { name: /Cotton Panjabi/ })).toHaveCount(0);
    await create.getByRole('button', { name: 'Load more products' }).click();
    const productDetail = `**/api/orders/catalogue/${productId}`;
    await page.route(productDetail, async (route) => {
      const response = await route.fetch();
      const older: OrderCatalogueProduct = await response.json();
      await route.fulfill({
        response,
        json: {
          ...older,
          variants: older.variants
            .filter(({ id }) => id !== largerVariantId)
            .map((variant) => ({ ...variant, pricePoisha: 100000, available: 4 })),
        },
      });
    });
    await product.selectOption(productId);
    await expect(size.getByRole('option', { name: 'M · 4 left' })).toHaveCount(1);
    await expect(size.getByRole('option', { name: 'L · 2 left' })).toHaveCount(0);
    await product.selectOption('');
    await page.unroute(productDetail);
    const catalogueSearch = create.getByText('Search products', { exact: true });
    await catalogueSearch.click();
    const search = create.getByLabel('Product name');
    const refreshedList = page.waitForResponse((response) =>
      response.url().includes('/orders/catalogue?search=Cotton+Panjabi'),
    );
    await search.fill('Cotton Panjabi');
    await refreshedList;
    await page.route(productDetail, (route) => route.fulfill({ status: 503 }));
    const failedDetail = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/orders/catalogue/${productId}`) && response.status() === 503,
    );
    await product.selectOption(productId);
    await failedDetail;
    const beforeSizing = page.waitForResponse((response) =>
      response.url().includes('/orders/catalogue?search=Unlisted+product'),
    );
    await search.fill('Unlisted product');
    expect(await (await beforeSizing).json()).toMatchObject({ items: [] });
    await expect(product).toHaveValue(productId);
    await expect(size.getByRole('option', { name: 'M · 5 left' })).toHaveCount(1);
    await expect(size).toHaveValue('');
    await page.unroute(productDetail);
    await search.clear();
    await catalogueSearch.click();
    await create.getByRole('button', { name: 'Save order' }).click();
    await expect(size).toHaveAttribute('aria-invalid', 'true');
    await expect(size.getByRole('option', { name: 'M · 5 left' })).toHaveCount(1);
    await size.selectOption(variantId);
    await expect(size).toHaveAttribute('aria-invalid', 'false');
    await expect(create.getByText('5 in stock')).toBeVisible();
    const cod = create.getByText(/^Cash on delivery/);
    await expect(cod.getByText('৳1,310', { exact: true })).toBeVisible();
    await create.getByRole('button', { name: 'Add product' }).click();
    await expect(create.getByText('Cash on delivery')).toHaveCount(0);
    await create.getByRole('button', { name: 'Remove' }).last().click();
    await catalogueSearch.click();
    const catalogueFiltered = page.waitForResponse((response) =>
      response.url().includes('/orders/catalogue?search=Missing+product'),
    );
    await search.fill('Missing product');
    await catalogueFiltered;
    await size.selectOption({ label: 'L · 2 left' });
    await expect(cod.getByText('৳1,960', { exact: true })).toBeVisible();
    await size.selectOption(variantId);
    await expect(create.getByText('5 in stock')).toBeVisible();
    await expect(cod.getByText('৳1,310', { exact: true })).toBeVisible();
    await search.clear();
    await catalogueSearch.click();
    await create.getByLabel('Delivery (৳)').fill('90.25');
    await expect(cod.getByText('৳1,340.25', { exact: true })).toBeVisible();
    await capture(page, 'new');
    if (process.env.WEB_7_ORDER_EVIDENCE === '1') {
      await gift.uncheck();
      await captureNewOrder(page, create);
      await gift.check();
      await create.getByLabel('Recipient name').fill('Karim Ahmed');
      await recipientPhone.fill('01701000015');
    }
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
    await expect(create.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await expect(create.getByRole('button', { name: 'Close dialog', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(create).toBeVisible();
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
    await create.getByText('Find a customer', { exact: true }).click();
    await create.getByLabel('Customer name or phone').fill('Sonia Akter');
    await create.getByRole('button', { name: /Sonia Akter/ }).click();
    await expect(create.getByLabel('Phone', { exact: true })).toHaveValue('01701000024');
    await gift.check();
    await expect(recipientPhone).toHaveValue('');
    await create.getByLabel('Recipient name').fill('Nusrat Akter');
    await recipientPhone.fill('01701000025');
    await create.getByLabel('Address').fill('Road 4, Dhanmondi');
    await create.getByLabel('Division').selectOption({ label: 'Dhaka' });
    await create.getByLabel('District').selectOption({ label: 'Dhaka' });
    await expect(create.getByLabel('Delivery (৳)')).toHaveAttribute('placeholder', '60.00');
    await create.getByLabel('Product 1', { exact: true }).selectOption(productId);
    await create.getByLabel('Size 1', { exact: true }).selectOption(variantId);
    await expect(create.getByText('4 in stock')).toBeVisible();
    await create.getByLabel('Discount (৳)').fill('1260');
    await expect(create.getByText('Discount cannot exceed the item total.')).toBeVisible();
    await expect(cod).toHaveCount(0);
    await create.getByLabel('Discount (৳)').fill('50');
    await expect(create.getByText(/^Total/).getByText('৳1,260', { exact: true })).toBeVisible();
    await create.getByLabel('Discount (৳)').clear();
    await create.getByLabel('Advance paid (৳)').fill('200');
    await expect(cod.getByText('৳1,110', { exact: true })).toBeVisible();
    await capture(page, 'buyer-and-advance');
    let confirmKey: string | undefined;
    let confirmBody: string | null;
    await page.route('**/api/orders', async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.continue();
      expect(request.postDataJSON()).toMatchObject({ confirm: true });
      if (confirmKey) {
        expect(request.headers()['idempotency-key']).toBe(confirmKey);
        expect(request.postData()).toBe(confirmBody);
        return route.continue();
      }
      confirmKey = request.headers()['idempotency-key'];
      confirmBody = request.postData();
      expect(confirmKey).toBeTruthy();
      const confirmed = await route.fetch();
      expect(confirmed.status()).toBe(201);
      expect(await confirmed.json()).toMatchObject({ stage: 'to_pack' });
      await route.abort();
    });
    await create.getByRole('button', { name: 'Save as confirmed' }).click();
    await expect(create.getByText('Could not confirm the save')).toBeVisible();
    await create.getByRole('button', { name: 'Retry save' }).click();
    await expect(detail.getByText('Nusrat Akter', { exact: true })).toBeVisible();
    await page.unroute('**/api/orders');
    await expect(detail.getByRole('link', { name: 'Open profile' })).toHaveAttribute(
      'href',
      `/customers/${buyerId}`,
    );
    await expect(detail.getByText('To confirm → To pack')).toBeVisible();
    await expect(detail.getByText('৳1,110')).toBeVisible();

    const newPrice = await context.request.patch(`/api/products/${productId}`, {
      data: { pricePoisha: 140000, isStockTracked: false },
      headers: { Origin: baseURL!, 'X-Session-Context': storeTag },
    });
    expect(newPrice.status()).toBe(200);
    await page.reload();
    const editButton = detail.getByRole('button', { name: 'Edit order' });
    await expect(editButton).toBeVisible();
    await capture(page, 'edit-detail');
    await editButton.click();
    const edit = page.getByRole('dialog', { name: 'Edit order' });
    await expect(edit.getByText('Sonia Akter')).toBeVisible();
    await expect(edit.getByText('৳1,250 · 3 in stock', { exact: true })).toBeVisible();
    await expect(edit.getByLabel('Advance paid (৳)')).toHaveValue('200.00');
    await expect(edit.getByRole('button', { name: 'Save order' })).toBeDisabled();
    await edit.getByLabel('Quantity 1').fill('2');
    await expect(
      edit.getByText(/^Cash on delivery/).getByText('৳2,360', { exact: true }),
    ).toBeVisible();
    await capture(page, 'edit');
    await edit.getByLabel('Discount (৳)').fill('50');
    await expect(
      edit.getByText(/^Cash on delivery/).getByText('৳2,310', { exact: true }),
    ).toBeVisible();
    await edit.getByRole('button', { name: 'Save order' }).click();
    await expect(edit).toBeHidden();
    await expect(editButton).toBeFocused();
    await expect(detail.getByText('৳2,310')).toBeVisible();

    await editButton.click();
    const savedDiscount = edit.getByLabel('Discount (৳)');
    await expect(savedDiscount).toHaveValue('50.00');
    await savedDiscount.clear();
    await expect(
      edit.getByText(/^Cash on delivery/).getByText('৳2,360', { exact: true }),
    ).toBeVisible();
    await edit.getByRole('button', { name: 'Save order' }).click();
    await expect(edit).toBeHidden();
    await expect(detail.getByText('৳2,360')).toBeVisible();

    await editButton.click();
    await edit.getByLabel('Address').fill('Updated delivery address');
    const patch = page.waitForRequest(
      (req) => req.method() === 'PATCH' && /\/api\/orders\/[^/]+$/.test(req.url()),
    );
    await edit.getByRole('button', { name: 'Save order' }).click();
    expect((await patch).postDataJSON()).not.toHaveProperty('items');
    await expect(edit).toBeHidden();
    await expect(detail.getByText('Updated delivery address')).toBeVisible();
    await expect(detail.getByText('৳2,360')).toBeVisible();

    await detail.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'New order' }).click();
    await create.getByLabel('Name', { exact: true }).fill('Mina Akter');
    await create.getByLabel('Phone', { exact: true }).fill('01701000026');
    await create.getByLabel('Address').fill('House 10, Mirpur');
    await create.getByLabel('Division').selectOption({ label: 'Dhaka' });
    await create.getByLabel('District').selectOption({ label: 'Dhaka' });
    await create.getByText('Search products', { exact: true }).click();
    await create.getByLabel('Product name').fill('Cotton Panjabi');
    await create.getByLabel('Product 1', { exact: true }).selectOption(productId);
    await create.getByLabel('Size 1', { exact: true }).selectOption(variantId);
    const selfDelivery = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/orders') && response.request().method() === 'POST',
    );
    await create.getByRole('button', { name: 'Save order' }).click();
    const saved = await selfDelivery;
    expect(saved.status()).toBe(201);
    expect(await saved.json()).toMatchObject({
      buyerName: 'Mina Akter',
      isRecipientBuyer: true,
      recipientName: 'Mina Akter',
      recipientPhone: '01701000026',
    });
    await expect(detail.getByText('House 10, Mirpur')).toBeVisible();
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
    await database.pool.query(
      'delete from product_variants where store_id=$1 and id=any($2::uuid[])',
      [storeId, [variantId, largerVariantId]],
    );
    await database.pool.query('delete from products where store_id=$1 and id=any($2::uuid[])', [
      storeId,
      [productId, ...otherProducts],
    ]);
    await database.pool.query(
      'delete from delivery_zones where store_id=$1 and id=any($2::uuid[])',
      [storeId, zoneIds],
    );
    if (insertedCounter)
      await database.pool.query('delete from store_counters where store_id=$1', [storeId]);
    await database.pool.end();
  }
});
