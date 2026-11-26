import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import type { ProductResponse } from '@dakly/contracts/products';
import { createDatabase } from '@dakly/db/client';

import { waitForProductIndex } from './fixtures/product-index';

test.use({ screenshot: 'off' });

test('creates a product on its page, manages photos, edits it and changes stock', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const evidence = resolve(process.cwd(), '../../docs/design/evidence/prod-11-remove-old-editor');
  // CI keeps only e2e-artifacts, so each screenshot is also written there.
  const ciCopy = resolve(process.cwd(), 'e2e-artifacts/prod-11-remove-old-editor');
  const name = 'Silk scarf editor fixture';
  let productId: string | undefined;
  const fileIds: string[] = [];
  await mkdir(evidence, { recursive: true });
  await mkdir(ciCopy, { recursive: true });
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  async function request(path: string, data?: unknown, method = 'POST') {
    const session = await (await context.request.get('/api/me/context')).json();
    return context.request.fetch(`/api${path}`, {
      method,
      data,
      headers: { Origin: baseURL!, 'X-Session-Context': session.contextTag },
    });
  }
  async function saved() {
    return (await (
      await request(`/products/${productId}`, undefined, 'GET')
    ).json()) as ProductResponse;
  }
  async function capture(screen: string) {
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.mouse.move(width - 1, height - 1);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      for (const directory of [evidence, ciCopy])
        await page.screenshot({ path: resolve(directory, `${screen}-${width}.png`) });
    }
  }
  async function changeStockOnPage(quantity: string, reason: string) {
    await page.getByRole('button', { name: 'Change stock', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /Adjust stock/ });
    await dialog.getByLabel('Change in stock').fill(quantity);
    await dialog.getByLabel('Reason').fill(reason);
    await dialog.getByRole('button', { name: 'Save stock', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  try {
    expect((await request('/me/active-store', { storeId: fixture.storeIds[0] })).status()).toBe(
      204,
    );
    await page.goto('/products/new');
    await page.getByLabel('Product name', { exact: true }).fill(name);
    const createdResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/products') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
    );
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const created = (await (await createdResponse).json()) as ProductResponse;
    productId = created.id;
    expect(created.status).toBe('hidden');
    await expect(page).toHaveURL(new RegExp(`/products/${productId}$`));
    await waitForProductIndex(database, { storeId: fixture.storeIds[0], id: productId });
    expect(
      (
        await request(`/variants/${created.variants[0]!.id}/stock-adjustments`, {
          quantity: 3,
          reason: 'Opening count',
        })
      ).status(),
    ).toBe(204);
    await page.reload();

    const png = resolve(process.cwd(), 'e2e/fixtures/silk-scarf.png');
    for (const count of [1, 2]) {
      const confirmed = page.waitForResponse(
        (response) => response.url().endsWith('/photos/confirm') && response.status() === 201,
      );
      await expect(page.getByLabel('Add photo')).toBeEnabled();
      const choosing = page.waitForEvent('filechooser');
      await page.getByText('Add', { exact: true }).click();
      await (await choosing).setFiles(png);
      const withPhoto = (await (await confirmed).json()) as ProductResponse;
      fileIds.push(withPhoto.photos[count - 1]!.id);
      await expect(page.getByText(`${count} photo`)).toBeVisible();
    }

    const reordered = page.waitForResponse(
      (response) =>
        response.url().endsWith('/photos') &&
        response.request().method() === 'PATCH' &&
        response.status() === 200,
    );
    const move = page.getByRole('button', { name: 'Move photo 2 earlier' });
    await move.focus();
    await move.press('Enter');
    expect(((await (await reordered).json()) as ProductResponse).imageFileIds).toEqual([
      fileIds[1],
      fileIds[0],
    ]);

    await page.getByRole('button', { name: 'Remove photo 1' }).click();
    const removal = page.getByRole('dialog', { name: `Remove photo from ${name}?` });
    await expect(removal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(removal).toHaveCount(0);
    await page.getByRole('button', { name: 'Remove photo 1' }).click();
    const removed = page.waitForResponse(
      (response) => response.url().endsWith(`/photos/${fileIds[1]}`) && response.status() === 204,
    );
    await removal.getByRole('button', { name: 'Remove photo', exact: true }).click();
    await removed;
    await expect(page.getByText('1 photo')).toBeVisible();
    expect((await saved()).imageFileIds).toEqual([fileIds[0]]);
    await capture('photos');

    await changeStockOnPage('-1', 'Damaged');
    await expect.poll(async () => (await saved()).variants[0]!.onHand).toBe(2);

    await page.getByLabel('Regular price ৳', { exact: true }).fill('2450.50');
    await page.getByLabel('Description', { exact: true }).fill('Cotton fabric with a regular fit.');
    await page.getByLabel('Other names', { exact: true }).fill('স্কার্ফ\nScarf');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const changed = await saved();
    expect(changed.status).toBe('hidden');
    expect(changed.pricePoisha).toBe(245050);
    expect(changed.aliases).toEqual(['স্কার্ফ', 'Scarf']);
    expect(changed.variants[0]).toMatchObject({ id: created.variants[0]!.id, onHand: 2 });
    await capture('edited');

    await page.getByRole('combobox', { name: 'Status', exact: true }).click();
    await page.getByRole('option', { name: 'Active', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveText('Active');

    // The list opens the same page, and its row has Change stock as a dialog.
    await page.goto(`/products?search=${encodeURIComponent('Silk scarf editor')}`);
    await page.getByRole('link', { name, exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/products/${productId}$`));
    await page.goBack();
    await page
      .getByRole('button', { name: `Change stock for ${name}`, exact: true })
      .filter({ visible: true })
      .click();
    const dialog = page.getByRole('dialog', { name: /Adjust stock/ });
    await dialog.getByLabel('Change in stock').fill('2');
    await dialog.getByLabel('Reason').fill('Recount');
    await dialog.getByRole('button', { name: 'Save stock', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(async () => (await saved()).variants[0]!.onHand).toBe(4);
    await capture('list-change-stock');

    // Old addresses for the removed modal and drawer land on the full pages.
    await page.goto(`/products?product=${productId}`);
    await expect(page).toHaveURL(new RegExp(`/products/${productId}$`));
    await page.goto('/products?create=1');
    await expect(page).toHaveURL(/\/products\/new$/);
  } finally {
    try {
      await request('/me/active-store', { storeId: fixture.storeIds[0] });
      if (productId) {
        const variants = await database.pool.query<{ id: string }>(
          'select id from product_variants where store_id=$1 and product_id=$2',
          [fixture.storeIds[0], productId],
        );
        const ids = variants.rows.map((variant) => variant.id);
        await database.pool.query(
          "delete from outbox_events where store_id=$1 and (payload->>'productId'=$2 or payload->>'variantId'=any($3::text[]))",
          [fixture.storeIds[0], productId, ids],
        );
        await database.pool.query(
          'delete from stock_movements where store_id=$1 and variant_id=any($2::uuid[])',
          [fixture.storeIds[0], ids],
        );
        await database.pool.query(
          'delete from product_variants where store_id=$1 and product_id=$2',
          [fixture.storeIds[0], productId],
        );
        await database.pool.query('delete from products where store_id=$1 and id=$2', [
          fixture.storeIds[0],
          productId,
        ]);
        await database.pool.query('delete from files where store_id=$1 and id=any($2::uuid[])', [
          fixture.storeIds[0],
          fileIds,
        ]);
      }
    } finally {
      await database.pool.end();
    }
  }
});
