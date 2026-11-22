import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import type { ProductResponse } from '@dakly/contracts/products';
import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('builds a variants grid, saves it and writes one stock reason', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const evidence = resolve(process.cwd(), '../../docs/design/evidence/prod-11-variants');
  // CI keeps only e2e-artifacts, so each screenshot is also written there.
  const ciCopy = resolve(process.cwd(), 'e2e-artifacts/prod-11-variants');
  const name = 'Cotton T-shirt variants fixture';
  let productId: string | undefined;
  await mkdir(evidence, { recursive: true });
  await mkdir(ciCopy, { recursive: true });
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  async function capture(screen: string, onPhone?: () => Promise<void>) {
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      if (width === 360) await onPhone?.();
      await page.mouse.move(width - 1, height - 1);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      for (const directory of [evidence, ciCopy])
        await page.screenshot({
          path: resolve(directory, `${screen}-${width}.png`),
          fullPage: true,
        });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  async function addValues(option: string, values: string[]) {
    const box = page.getByLabel(`Add a value to ${option}`, { exact: true });
    for (const value of values) {
      await box.fill(value);
      await box.press('Enter');
    }
  }
  async function loadProduct() {
    const response = await context.request.get(`/api/products/${productId}`);
    expect(response.status()).toBe(200);
    return (await response.json()) as ProductResponse;
  }
  try {
    const session = await (await context.request.get('/api/me/context')).json();
    const activated = await context.request.fetch('/api/me/active-store', {
      method: 'POST',
      data: { storeId: fixture.storeIds[0] },
      headers: { Origin: baseURL!, 'X-Session-Context': session.contextTag },
    });
    expect(activated.status()).toBe(204);

    await page.goto('/products/new');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Selling price ৳', { exact: true }).fill('1200');
    await page.getByLabel('Your cost ৳', { exact: true }).fill('650');
    await page.getByLabel('Stock', { exact: true }).fill('12');
    await page.getByLabel('Product code').fill('UT-TS-01');
    await expect(page.getByText('Profit')).toBeVisible();
    await capture('no-options');

    await page.getByRole('button', { name: /Suggest options/ }).click();
    await expect(page.getByRole('button', { name: 'Add all' })).toBeVisible();
    await capture('suggest-options');
    await page.getByRole('button', { name: 'Dismiss' }).click();

    await page.getByRole('button', { name: 'Add options', exact: true }).click();
    await page.getByLabel('Option 1 name').fill('Colour');
    await addValues('Colour', ['Black', 'White']);
    await page.getByRole('button', { name: /Add option \(max 3\)/ }).click();
    await page.getByLabel('Option 2 name').fill('Size');
    await addValues('Size', ['S', 'M', 'L']);
    await expect(page.getByLabel('Stock for Black / S')).toHaveValue('12');
    await expect(page.getByLabel('Code for Black / S')).toHaveValue('UT-TS-01');
    const stocks: [string, string][] = [
      ['Black / M', '20'],
      ['Black / L', '8'],
      ['White / S', '12'],
      ['White / M', '20'],
    ];
    for (const [label, stock] of stocks) await page.getByLabel(`Stock for ${label}`).fill(stock);
    await page.getByLabel('Select Black / S').click();
    await page.getByLabel('Select Black / M').click();
    await expect(page.getByText('2 selected')).toBeVisible();
    await capture('grid', async () => {
      await page.getByRole('button', { name: 'Black / L summary' }).click();
    });

    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/products') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
    );
    await page.getByRole('button', { name: 'Save as hidden', exact: true }).click();
    productId = ((await (await created).json()) as ProductResponse).id;
    await expect(page).toHaveURL(new RegExp(`/products/${productId}$`));
    await expect(page.getByLabel('Stock for Black / S')).toHaveValue('12');
    const first = await loadProduct();
    expect(first.variants).toHaveLength(6);
    expect(first.variants.find(({ title }) => title === 'Black / M')?.onHand).toBe(20);

    await page.getByLabel('Stock for Black / S').fill('9');
    await page.getByRole('button', { name: 'Save product', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Why did the stock change?' })).toBeVisible();
    await capture('stock-reason');
    await page.getByLabel('Reason').fill('Counted the shelf');
    await page.getByRole('button', { name: 'Save with this reason' }).click();
    await expect(page.getByRole('heading', { name: 'Why did the stock change?' })).toBeHidden();
    await expect
      .poll(async () => (await loadProduct()).variants.find((v) => v.title === 'Black / S')?.onHand)
      .toBe(9);
    const reasons = await database.pool.query(
      `select m.reason, m.quantity from stock_movements m join product_variants v on v.id = m.variant_id
       where v.product_id = $1 and m.kind = 'adjust' and m.reason = 'Counted the shelf'`,
      [productId],
    );
    expect(reasons.rows).toHaveLength(1);
    expect(Number(reasons.rows[0].quantity)).toBe(-3);
  } finally {
    try {
      if (productId) {
        const store = fixture.storeIds[0];
        const variants = `select id from product_variants where store_id=$1 and product_id=$2`;
        await database.pool.query(`delete from stock_movements where variant_id in (${variants})`, [
          store,
          productId,
        ]);
        await database.pool.query(
          "delete from outbox_events where store_id=$1 and payload->>'productId'=$2",
          [store, productId],
        );
        await database.pool.query(
          'delete from product_variants where store_id=$1 and product_id=$2',
          [store, productId],
        );
        await database.pool.query('delete from products where store_id=$1 and id=$2', [
          store,
          productId,
        ]);
      }
    } finally {
      await database.pool.end();
    }
  }
});
