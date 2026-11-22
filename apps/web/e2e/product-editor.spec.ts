import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import type { ProductResponse } from '@dakly/contracts/products';
import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('saves unfinished products, edits variants without losing stock and manages visibility', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const evidence = resolve(process.cwd(), '../../docs/design/evidence/prod-4-editor');
  const photoEvidence = resolve(process.cwd(), '../../docs/design/evidence/prod-4-photos');
  const name = 'Silk scarf editor fixture';
  let productId: string | undefined;
  const fileIds: string[] = [];
  await mkdir(evidence, { recursive: true });
  await mkdir(photoEvidence, { recursive: true });
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
  async function capture(screen: string, directory = evidence, title?: string) {
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      const dialog = page.getByRole('dialog', { name: title });
      await dialog.evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.mouse.move(width - 1, height - 1);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await expect
        .poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
        .toBe(true);
      await page.screenshot({ path: resolve(directory, `${screen}-${width}.png`) });
    }
  }
  async function reopenWithCatalogPhoto(fileId: string) {
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    const productLink = page.getByRole('link', { name, exact: true });
    const thumbnail = productLink.getByRole('img', { name, exact: true });
    await expect(thumbnail).toHaveAttribute('src', new RegExp(`/${fileId}\\?`));
    await expect
      .poll(() => thumbnail.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
    await expect(
      page.getByRole('button', { name: `Adjust stock for ${name}, Default` }),
    ).toHaveText('Default 3');
    await productLink.click();
  }
  try {
    expect((await request('/me/active-store', { storeId: fixture.storeIds[0] })).status()).toBe(
      204,
    );
    await page.goto('/products?create=1');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await capture('create');
    await page.getByRole('button', { name: 'Add option', exact: true }).click();
    await page.getByLabel('Option 1 name', { exact: true }).fill('Fabric');
    await page.getByLabel('Option 1 values', { exact: true }).fill('Cotton\nSilk');
    const fabric = page.getByRole('combobox', { name: 'Fabric for variant 1' });
    await fabric.selectOption('Silk');
    await expect(fabric).toHaveValue('Silk');
    await page.getByRole('button', { name: 'Remove option 1' }).click();
    const createdResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/products') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
    );
    await page.getByRole('button', { name: 'Save as hidden', exact: true }).click();
    const created = (await (await createdResponse).json()) as ProductResponse;
    productId = created.id;
    expect(created.status).toBe('hidden');
    expect(created.pricePoisha).toBe(0);
    expect(created.variants).toHaveLength(1);
    expect(created.variants[0]!.isDefault).toBe(true);
    expect(created.readiness).toEqual(
      expect.arrayContaining(['needs_price', 'needs_photo', 'hidden']),
    );
    await expect(page.getByRole('dialog', { name })).toBeVisible();
    expect(
      (
        await request(`/variants/${created.variants[0]!.id}/stock-adjustments`, {
          quantity: 3,
          reason: 'Opening count',
        })
      ).status(),
    ).toBe(204);

    const png = resolve(process.cwd(), 'e2e/fixtures/silk-scarf.png');
    for (const count of [1, 2]) {
      const confirmed = page.waitForResponse(
        (response) => response.url().endsWith('/photos/confirm') && response.status() === 201,
      );
      await expect(page.getByLabel('Add photo')).toBeEnabled();
      const choosing = page.waitForEvent('filechooser');
      await page.getByText('Add', { exact: true }).click();
      await (await choosing).setFiles(png);
      const saved = (await (await confirmed).json()) as ProductResponse;
      fileIds.push(saved.photos[count - 1]!.id);
      await expect(page.getByRole('heading', { name: 'Photos', exact: true })).toBeVisible();
      await expect(page.getByText(`${count} photo`)).toBeVisible();
    }
    await reopenWithCatalogPhoto(fileIds[0]!);
    await capture('gallery', photoEvidence);

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
    await expect(page.getByRole('button', { name: 'Remove photo 1' })).toBeFocused();
    await reopenWithCatalogPhoto(fileIds[1]!);
    await page.getByRole('button', { name: 'Remove photo 1' }).click();
    const removalTitle = `Remove photo from ${name}?`;
    const removal = page.getByRole('dialog', { name: removalTitle });
    await expect(removal).toBeVisible();
    await capture('remove', photoEvidence, removalTitle);
    await page.keyboard.press('Escape');
    await expect(removal).toHaveCount(0);
    await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Remove photo 1' }).click();

    let releaseRemoval: () => void = () => undefined;
    const removalGate = new Promise<void>((resolve) => {
      releaseRemoval = resolve;
    });
    const removalPath = `**/api/products/${productId}/photos/${fileIds[1]}`;
    await page.route(removalPath, async (route) => {
      await removalGate;
      await route.continue();
    });
    const removed = page.waitForResponse(
      (response) => response.url().endsWith(`/photos/${fileIds[1]}`) && response.status() === 204,
    );
    try {
      await removal.getByRole('button', { name: 'Remove photo', exact: true }).click();
      await expect(removal.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(removal).toBeVisible();
    } finally {
      releaseRemoval();
    }
    await removed;
    await page.unroute(removalPath);
    await expect(page.getByRole('heading', { name: 'Photos', exact: true })).toBeVisible();
    await expect(page.getByText('1 photo')).toBeVisible();
    const afterRemoval = (await (
      await request(`/products/${productId}`, undefined, 'GET')
    ).json()) as ProductResponse;
    expect(afterRemoval.imageFileIds).toEqual([fileIds[0]]);
    await reopenWithCatalogPhoto(fileIds[0]!);
    await expect(page.getByRole('img', { name: `${name} photo 1` })).toBeVisible();

    await page.getByRole('button', { name: 'Edit product', exact: true }).click();
    await page.getByLabel('Selling price ৳', { exact: true }).fill('2450.50');
    await page.getByLabel('Description', { exact: true }).fill('Cotton fabric with a regular fit.');
    await page.getByLabel('Other names', { exact: true }).fill('স্কার্ফ\nScarf');
    await page.getByRole('button', { name: 'Add option', exact: true }).click();
    await page.getByLabel('Option 1 name', { exact: true }).fill('Size (U.S.)');
    await page.getByLabel('Option 1 values', { exact: true }).fill('M\nL');
    await page
      .getByRole('combobox', { name: 'Size (U.S.) for variant 1', exact: true })
      .selectOption('M');
    await page.getByLabel('Product code for variant 1', { exact: true }).fill('SCARF-M');
    await page.getByRole('button', { name: 'Add variant', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Size (U.S.) for variant 2', exact: true })
      .selectOption('L');
    await page.getByLabel('Price override for variant 2 (Taka)', { exact: true }).fill('2700.25');
    await capture('edit', photoEvidence);
    await page.getByRole('button', { name: 'Save product', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit product', exact: true })).toBeVisible();
    const changed = (await (
      await request(`/products/${productId}`, undefined, 'GET')
    ).json()) as ProductResponse;
    expect(changed.status).toBe('hidden');
    expect(changed.pricePoisha).toBe(245050);
    expect(changed.aliases).toEqual(['স্কার্ফ', 'Scarf']);
    expect(changed.variants[0]).toMatchObject({
      id: created.variants[0]!.id,
      onHand: 3,
      optionValues: { 'Size (U.S.)': 'M' },
      pricePoisha: 245050,
    });
    expect(changed.variants[1]).toMatchObject({ priceOverridePoisha: 270025, pricePoisha: 270025 });

    await page.getByRole('button', { name: 'Show product', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Hide product', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Hide product', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Show product', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit product', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('A'.repeat(200));
    await page.getByRole('button', { name: 'Save product', exact: true }).click();
    const longDialog = page.getByRole('dialog', { name: 'A'.repeat(200) });
    await expect(longDialog).toBeVisible();
    await expect
      .poll(() => longDialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
      .toBe(true);
    const close = longDialog.getByRole('button', { name: 'Close dialog', exact: true });
    expect(
      await close.evaluate((element) => {
        const button = element.getBoundingClientRect();
        const panel = element.closest('dialog')!.getBoundingClientRect();
        return (
          button.left >= panel.left &&
          button.right <= panel.right &&
          button.width >= 40 &&
          button.height >= 40
        );
      }),
    ).toBe(true);

    await page.getByRole('button', { name: 'Edit product', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Unsaved name stays in this shop');
    const contextPath = '**/api/me/context';
    await page.route(contextPath, (route) => route.abort());
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(
      page.getByText('Could not verify your account and shop. Refresh to continue.'),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.unroute(contextPath);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
      'Unsaved name stays in this shop',
    );
    expect((await request('/me/active-store', { storeId: fixture.storeIds[1] })).status()).toBe(
      204,
    );
    await page.evaluate(() => window.dispatchEvent(new Event('dakly-context-changed')));
    await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0);
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
