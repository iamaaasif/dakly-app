import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import type { DeliveryZoneListResponse } from '@dakly/contracts/delivery';
import { createDatabase } from '@dakly/db/client';

const evidence = resolve(process.cwd(), '../../docs/design/evidence/dsn-10-new-order');

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
    await page.screenshot({
      path: resolve(evidence, `${name}-${width}.png`),
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('takes a staff order on the new order page and edits it', async ({
  page,
  context,
  baseURL,
}) => {
  page.setDefaultTimeout(8000);
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as { token: string; storeIds: string[] };
  const storeId = fixture.storeIds[0]!;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const productId = `0${randomUUID().slice(1)}`;
  const soldOutId = `0${randomUUID().slice(1)}`;
  const variantId = randomUUID();
  const largerVariantId = randomUUID();
  const soldOutVariantId = randomUUID();
  let zoneIds: string[] = [];
  let zoneId: string | undefined;
  let insertedCounter = false;
  let existingBuyerId: string | undefined;
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  try {
    const current = await context.request.get('/api/me/context');
    const { contextTag } = await current.json();
    const headers = { Origin: baseURL!, 'X-Session-Context': contextTag };
    const selected = await context.request.post('/api/me/active-store', {
      data: { storeId },
      headers,
    });
    expect(selected.status()).toBe(204);
    const counter = await database.pool.query(
      'insert into store_counters (store_id) values ($1) on conflict do nothing returning store_id',
      [storeId],
    );
    insertedCounter = counter.rowCount === 1;
    await database.pool.query(
      "insert into products (id,store_id,name,price_poisha) values ($1,$2,'Cotton Panjabi',125000),($3,$2,'Sold Out Shirt',99000)",
      [productId, storeId, soldOutId],
    );
    await database.pool.query(
      "insert into product_variants (id,store_id,product_id,title,on_hand) values ($1,$2,$3,'M',5)",
      [variantId, storeId, productId],
    );
    await database.pool.query(
      "insert into product_variants (id,store_id,product_id,title,on_hand,price_override_poisha,position) values ($1,$2,$3,'L',2,190000,1)",
      [largerVariantId, storeId, productId],
    );
    await database.pool.query(
      "insert into product_variants (id,store_id,product_id,title,on_hand) values ($1,$2,$3,'M',0)",
      [soldOutVariantId, storeId, soldOutId],
    );
    const zonesCreated = await context.request.post('/api/delivery-zones/initialize-defaults', {
      headers,
    });
    expect(zonesCreated.status()).toBe(201);
    const zones = (await zonesCreated.json()) as DeliveryZoneListResponse;
    zoneIds = zones.items.map(({ id }) => id);
    zoneId = zones.items.find(({ name }) => name === 'Inside Dhaka')?.id;
    expect(zoneId).toBeDefined();

    await page.goto('/orders');
    await page.getByRole('link', { name: 'New order' }).click();
    await expect(page).toHaveURL(/\/orders\/new$/);
    await expect(page.getByRole('heading', { name: 'Create new order' })).toBeVisible();
    await capture(page, 'empty');

    // Product search: keyboard only, variant chips, stock limits.
    const search = page.getByRole('combobox', { name: 'Add products' });
    await search.fill('cotton');
    const list = page.getByRole('listbox', { name: 'Matching products' });
    await expect(list.getByRole('option', { name: 'M' })).toBeVisible();
    await expect(list.getByRole('option', { name: 'L' })).toBeVisible();
    await search.press('ArrowDown');
    await expect(list.getByRole('option', { name: 'L' })).toHaveAttribute('aria-selected', 'true');
    await search.press('ArrowUp');
    await search.press('Enter');
    const lines = page.getByRole('list').filter({ hasText: 'Cotton Panjabi' });
    await expect(lines.getByText('5 in stock')).toBeVisible();
    await search.fill('sold out');
    await expect(list.getByRole('option', { name: /Sold Out Shirt/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(list.getByText('Out of stock')).toBeVisible();
    await search.press('Enter');
    await expect(page.getByText('Sold Out Shirt is out of stock')).toHaveCount(0);
    await expect(lines.getByText('Sold Out Shirt')).toHaveCount(0);
    await search.fill('');
    const quantity = page.getByLabel('Quantity of Cotton Panjabi M');
    await quantity.fill('9');
    await expect(quantity).toHaveValue('5');
    await page
      .getByRole('button', { name: 'One more' })
      .click({ force: true })
      .catch(() => undefined);
    await quantity.fill('2');
    await expect(quantity).toHaveValue('2');

    // Customer, area and delivery charge from the shop's zones.
    await page.getByLabel('Phone', { exact: true }).fill('01701000014');
    await page.getByLabel('Name', { exact: true }).fill('Rahim Ahmed');
    await page.getByLabel('Address').fill('House 14, Mirpur');
    await page.getByRole('button', { name: 'Create', exact: true }).first().click();
    await expect(page.getByText('Choose a district or upazila')).toBeVisible();
    await page.getByRole('combobox', { name: 'City' }).click();
    await page.getByRole('option', { name: 'Dhaka', exact: true }).click();
    await expect(page.getByLabel('Delivery charge')).toHaveAttribute('placeholder', '60.00');
    const summary = page.getByRole('heading', { name: 'Summary' }).locator('..').locator('..');
    await expect(summary.getByText('৳2,560', { exact: true }).first()).toBeVisible();
    await page.getByLabel('Advance payment').fill('200');
    await expect(
      summary.getByText('Cash to collect').locator('..').getByText('৳2,360'),
    ).toBeVisible();
    await capture(page, 'filled');

    // The test server has no AI model, so a pasted chat fails. The form keeps what was typed.
    await page
      .getByLabel('Paste a chat to fill the details')
      .fill('Name: Karim, 01712345678, Mirpur, Dhaka');
    await page.getByRole('button', { name: 'Fill with Dakly AI' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Something went wrong' })).toBeVisible();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Rahim Ahmed');

    // Removing a line can be undone.
    await page.getByRole('button', { name: 'Remove Cotton Panjabi M' }).click();
    await expect(page.getByText('Cotton Panjabi removed', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(quantity).toHaveValue('2');

    // Ctrl+Enter creates the order, and the toast offers another.
    await page.getByLabel('Name', { exact: true }).press('Control+Enter');
    await expect(page).toHaveURL(/\/orders\?selected=/);
    await expect(
      page.getByRole('button', { name: 'Create another', includeHidden: true }),
    ).toBeVisible();
    const detail = page.getByRole('dialog', { name: /^Order #/ });
    await expect(detail.getByText('Rahim Ahmed', { exact: true }).first()).toBeVisible();
    await expect(detail.getByRole('status', { name: 'Order stage' })).toHaveText('To confirm');
    await detail.getByRole('button', { name: 'Close', exact: true }).click();

    // A returning customer: the phone finds them, fills the details and warns about open orders.
    await page.getByRole('button', { name: 'Create another' }).click();
    await expect(page).toHaveURL(/\/orders\/new$/);
    await page.getByLabel('Phone', { exact: true }).fill('01701000014');
    await expect(page.getByText('Returning customer Rahim Ahmed')).toBeVisible();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Rahim Ahmed');
    await expect(page.getByLabel('Address')).toHaveValue('House 14, Mirpur');
    await expect(page.getByText('1 open order already go to this number.')).toBeVisible();
    await capture(page, 'returning');

    // Recently sold products show with nothing typed.
    await page.getByRole('combobox', { name: 'Add products' }).click();
    await expect(page.getByRole('listbox', { name: 'Recently sold products' })).toContainText(
      'Cotton Panjabi',
    );
    await page.getByRole('combobox', { name: 'Add products' }).press('Escape');

    // An existing contact is picked from the list as the number is typed.
    const buyer = await context.request.post('/api/contacts', {
      data: { name: 'Sonia Akter', phone: '01701000024' },
      headers,
    });
    expect(buyer.status()).toBe(201);
    existingBuyerId = (await buyer.json()).id;
    await page.getByLabel('Phone', { exact: true }).fill('017010000');
    await page
      .getByRole('option', { name: /Sonia Akter/ })
      .getByRole('button')
      .click();
    await expect(page.getByLabel('Phone', { exact: true })).toHaveValue('01701000024');
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Sonia Akter');
    await page.getByRole('combobox', { name: 'City' }).click();
    await page.getByRole('option', { name: 'Dhaka', exact: true }).click();
    await page.getByLabel('Address').fill('Road 4, Dhanmondi');
    const productSearch = page.getByRole('combobox', { name: 'Add products' });
    await productSearch.fill('cotton');
    await productSearch.press('Enter');
    await page.getByLabel('Advance payment').fill('200');
    await page.getByLabel('Confirm now and send it to To pack').check();
    await page.getByLabel('Name', { exact: true }).press('Control+Enter');
    await expect(page).toHaveURL(/\/orders\?selected=/);
    await expect(detail.getByText('Sonia Akter').first()).toBeVisible();
    const linked = await context.request.get(`/api/orders/customer-lookup?phone=01701000024`, {
      headers,
    });
    expect((await linked.json()).customer.contactId).toBe(existingBuyerId);
    expect((await linked.json()).openOrders).toBe(1);
    await expect(detail.getByText('To confirm → To pack')).toBeVisible();
    await expect(detail.getByText('৳1,110')).toBeVisible();

    const newPrice = await context.request.patch(`/api/products/${productId}`, {
      data: { pricePoisha: 140000, isStockTracked: false },
      headers: { Origin: baseURL!, 'X-Session-Context': contextTag },
    });
    expect(newPrice.status()).toBe(200);
    await page.reload();
    const editButton = detail.getByRole('button', { name: 'Edit', exact: true });
    await expect(editButton).toBeVisible();
    await capture(page, 'edit-detail');
    await editButton.click();
    const edit = page.getByRole('dialog', { name: 'Edit order' });
    await expect(edit.getByText('Sonia Akter')).toBeVisible();
    await expect(edit.getByText('৳1,250 · 2 in stock', { exact: true })).toBeVisible();
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
      [storeId, [variantId, largerVariantId, soldOutVariantId]],
    );
    await database.pool.query('delete from products where store_id=$1 and id=any($2::uuid[])', [
      storeId,
      [productId, soldOutId],
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
