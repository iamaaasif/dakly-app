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
  const name = 'Cotton T-shirt variants fixture';
  let productId: string | undefined;
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  async function capture(step: 2 | 3, screen: string, prepare: (width: number) => Promise<void>) {
    const evidence = resolve(process.cwd(), `../../docs/design/evidence/prod-17-${step}`);
    // CI keeps only e2e-artifacts, so each screenshot is also written there.
    const ciCopy = resolve(process.cwd(), `e2e-artifacts/prod-17-${step}`);
    await mkdir(evidence, { recursive: true });
    await mkdir(ciCopy, { recursive: true });
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await prepare(width);
      await page.mouse.move(width - 1, 0);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      for (const directory of [evidence, ciCopy])
        await page.screenshot({ path: resolve(directory, `${screen}-${width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  async function openValues(option: string) {
    await page.getByRole('button', { name: `+ ${option}`, exact: true }).click();
    await page.getByRole('button', { name: `Add values to ${option}` }).click();
    return page.getByRole('dialog', { name: `Add values to ${option}` });
  }
  async function capturePicker(option: string) {
    const name = `Add values to ${option}`;
    const trigger = page.getByRole('button', { name });
    await capture(2, `${option.toLowerCase()}-values`, async () => {
      await page.keyboard.press('Escape');
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      await expect(page.getByRole('dialog', { name })).toBeInViewport({ ratio: 0.9 });
    });
  }
  async function variantSheet(label: string) {
    await page.getByRole('button', { name: `Edit variant ${label}`, exact: true }).click();
    return page.getByRole('dialog', { name: label, exact: true });
  }
  async function closeVariant(sheet: Awaited<ReturnType<typeof variantSheet>>) {
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toBeHidden();
  }
  async function expectStock(label: string, value: string, code?: string) {
    const sheet = await variantSheet(label);
    await expect(sheet.getByLabel(`Stock for ${label}`)).toHaveValue(value);
    if (code) await expect(sheet.getByLabel(`Code for ${label}`)).toHaveValue(code);
    await closeVariant(sheet);
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
    await page.getByLabel('Product name', { exact: true }).fill(name);
    await page.getByLabel('Regular price ৳', { exact: true }).fill('1200');
    await page.getByLabel('Product cost ৳', { exact: true }).fill('650');
    await page.getByLabel('Available stock', { exact: true }).fill('12');
    await page.getByLabel('Product code').fill('UT-TS-01');
    await expect(page.getByText('Profit')).toBeVisible();
    await capture(2, 'no-options', () =>
      page.getByRole('heading', { name: 'Variations' }).scrollIntoViewIfNeeded(),
    );

    await page.getByRole('button', { name: /Suggest options/ }).click();
    await expect(page.getByRole('button', { name: 'Add all' })).toBeVisible();
    await capture(2, 'suggest-options', () =>
      page.getByRole('button', { name: 'Add all' }).scrollIntoViewIfNeeded(),
    );
    await page.getByRole('button', { name: 'Dismiss' }).click();

    const colors = await openValues('Color');
    await colors.getByRole('checkbox', { name: 'Black', exact: true }).check();
    await colors.getByRole('checkbox', { name: 'White', exact: true }).check();
    await capturePicker('Color');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();

    await page.getByRole('button', { name: 'Edit Color' }).click();
    await capture(2, 'edit-color', () => page.getByLabel('Option name').scrollIntoViewIfNeeded());
    await page.getByRole('button', { name: 'Cancel option changes' }).click();

    const sizes = await openValues('Size');
    for (const size of ['S', 'M', 'L'])
      await sizes.getByRole('checkbox', { name: size, exact: true }).check();
    await capturePicker('Size');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();

    const materials = await openValues('Material');
    await materials.getByRole('checkbox', { name: 'Select all' }).check();
    await expect(materials.getByRole('checkbox', { name: 'Cotton', exact: true })).toBeChecked();
    await capturePicker('Material');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Cancel option changes' }).click();

    const moveSize = page.getByRole('button', { name: 'Move Size' });
    await moveSize.dragTo(page.getByRole('button', { name: 'Move Color' }));
    await expectStock('S / Black', '12');
    await moveSize.press('ArrowDown');
    await expectStock('Black / S', '12', 'UT-TS-01');
    const stocks: [string, string][] = [
      ['Black / M', '20'],
      ['Black / L', '8'],
      ['White / S', '12'],
      ['White / M', '20'],
    ];
    for (const [label, stock] of stocks) {
      const sheet = await variantSheet(label);
      await sheet.getByLabel(`Stock for ${label}`).fill(stock);
      await closeVariant(sheet);
    }
    await page.getByLabel('Show by').selectOption('Size');
    await expect(page).toHaveURL(/groupBy=Size/);
    const medium = page.getByRole('region', { name: 'M variants', exact: true });
    await expect(
      medium.getByText('40 pcs', { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await medium.getByLabel('Price for all M variants').fill('1350');
    await expect(medium.getByLabel('Price for Black / M', { exact: true })).toHaveValue('1350');
    await expect(medium.getByLabel('Price for White / M', { exact: true })).toHaveValue('1350');
    await expect(page.getByLabel('Price for Black / S', { exact: true })).toHaveValue('');
    await page.getByLabel('Select Black / S').click();
    await page.getByLabel('Select Black / M').click();
    await expect(page.getByText('2 selected')).toBeVisible();
    await capture(3, 'grouped-variants', async (width) => {
      const row = page.getByRole('button', { name: /^Black \/ L summary/ });
      if (width === 360) await expect(row).toContainText('৳');
      await medium.scrollIntoViewIfNeeded();
    });
    await page.getByLabel('Show by').selectOption('Color');

    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/products') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
    );
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    productId = ((await (await created).json()) as ProductResponse).id;
    await expect(page).toHaveURL(new RegExp(`/products/${productId}$`));
    await expectStock('Black / S', '12');
    const details = page.getByRole('dialog', { name: 'Black / S', exact: true });
    await capture(3, 'edit-variant', async (width) => {
      if (await details.isVisible()) await closeVariant(details);
      const summary = page.getByRole('button', { name: /^Black \/ S summary/ });
      if (width === 360) await summary.click();
      else await variantSheet('Black / S');
      await expect(details.getByLabel('Code for Black / S')).toHaveValue('UT-TS-01');
      await expect(details.getByLabel('Low stock warning for Black / S')).toBeVisible();
      await expect(details).toBeInViewport({ ratio: 0.95 });
    });
    await closeVariant(details);
    const first = await loadProduct();
    expect(first.variants).toHaveLength(6);
    expect(first.variants.find(({ title }) => title === 'Black / M')?.onHand).toBe(20);

    await moveSize.press('ArrowUp');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect
      .poll(async () => (await loadProduct()).options.map(({ name }) => name))
      .toEqual(['Size', 'Color']);
    const reordered = await loadProduct();
    for (const original of first.variants)
      expect(reordered.variants.find(({ id }) => id === original.id)).toMatchObject({
        optionValues: original.optionValues,
        onHand: original.onHand,
        pricePoisha: original.pricePoisha,
        costPoisha: original.costPoisha,
        sku: original.sku,
      });
    await expect(
      page
        .getByRole('button', { name: 'Save', exact: true })
        .and(page.locator(':disabled:not([aria-busy="true"])')),
    ).toBeVisible();
    await page.reload();
    await expectStock('S / Black', '12', 'UT-TS-01');
    await moveSize.press('ArrowDown');
    const sheet = await variantSheet('Black / S');
    await sheet.getByLabel('Stock for Black / S').fill('9');
    await closeVariant(sheet);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Why did the stock change?' })).toBeVisible();
    await capture(3, 'stock-reason', () =>
      page.getByRole('heading', { name: 'Why did the stock change?' }).scrollIntoViewIfNeeded(),
    );
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
