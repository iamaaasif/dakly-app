import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page, type Route } from '@playwright/test';

import type { ProductResponse } from '@dakly/contracts/products';
import { createDatabase } from '@dakly/db/client';

test('keeps a stale edit and reloads the latest saved product', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const storeId = fixture.storeIds[0];
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  const session = await (await context.request.get('/api/me/context')).json();
  const headers = { Origin: baseURL!, 'X-Session-Context': session.contextTag };
  expect(
    (await context.request.post('/api/me/active-store', { data: { storeId }, headers })).status(),
  ).toBe(204);
  const created = await context.request.post('/api/products', {
    headers,
    data: { name: 'Cotton scarf version fixture', pricePoisha: 45000, status: 'active' },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as ProductResponse;
  const path = `/api/products/${id}`;
  const loaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === path && response.request().method() === 'GET',
  );
  try {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/products/${id}`);
    const product = (await (await loaded).json()) as ProductResponse;
    const name = page.getByLabel('Title', { exact: true });
    const description = page.getByLabel('Description', { exact: true });
    await name.fill('My unsaved scarf');
    await description.fill('My unsaved description');
    const price = page.getByLabel('Regular price', { exact: true });
    await price.fill('475');
    const changed = await context.request.patch(path, {
      headers,
      data: { name: 'New saved scarf', description: 'New saved description' },
    });
    expect(changed.status()).toBe(200);

    const refreshed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === path && response.request().method() === 'GET',
    );
    await page.getByRole('button', { name: 'Change stock', exact: true }).click();
    const stock = page.getByRole('dialog', { name: /Adjust stock/ });
    await stock.getByLabel('Change in stock').fill('1');
    await stock.getByLabel('Reason').fill('Restock');
    await stock.getByRole('button', { name: 'Save stock', exact: true }).click();
    const recent = (await (await refreshed).json()) as ProductResponse;
    expect(recent.version).toBeGreaterThan(product.version);
    expect(recent.variants[0]?.onHand).toBe(1);
    await expect(stock).toHaveCount(0);
    await expect(price).toHaveValue('475');
    await price.scrollIntoViewIfNeeded();

    const stale = page.waitForResponse(
      (response) => new URL(response.url()).pathname === path && response.status() === 409,
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await stale).request().postDataJSON()).toMatchObject({
      expectedVersion: product.version,
    });
    const message = page
      .getByRole('alert')
      .filter({ hasText: 'This product changed since you opened it.' });
    await expect(message).toBeInViewport();
    await expect(name).toHaveValue('My unsaved scarf');
    await expect(description).toHaveValue('My unsaved description');

    const directory = resolve(process.cwd(), '../../docs/design/evidence/prod-19-product-version');
    const artifacts = resolve(process.cwd(), 'e2e-artifacts/prod-19-product-version');
    await Promise.all([directory, artifacts].map((path) => mkdir(path, { recursive: true })));
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(message).toBeInViewport();
      for (const path of [directory, artifacts])
        await page.screenshot({ path: resolve(path, `product-changed-${width}x${height}.png`) });
    }

    await message.getByRole('button', { name: 'Reload' }).click();
    await expect(name).toHaveValue('New saved scarf');
    await expect(description).toHaveValue('New saved description');
    await expect(message).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    await name.fill('My second unsaved scarf');
    const concurrent = await context.request.patch(path, {
      headers,
      data: { name: 'Latest saved scarf' },
    });
    expect(concurrent.status()).toBe(200);
    const latest = (await concurrent.json()) as ProductResponse;
    const staleStatus = await changeStatus(page, path);
    expect(staleStatus.status()).toBe(409);
    expect(staleStatus.request().postDataJSON()).toMatchObject({ expectedVersion: recent.version });
    await expect(message).toBeInViewport();
    await expect(name).toHaveValue('My second unsaved scarf');
    await message.getByRole('button', { name: 'Reload' }).click();
    await expect(name).toHaveValue('Latest saved scarf');

    await name.fill('Saved after Status');
    const statusSaved = await changeStatus(page, path);
    expect(statusSaved.status()).toBe(200);
    expect(statusSaved.request().postDataJSON()).toMatchObject({ expectedVersion: latest.version });
    const hidden = (await statusSaved.json()) as ProductResponse;
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveText('Hidden');
    await expect(name).toHaveValue('Saved after Status');
    const unavailable = async (route: Route) => {
      if (route.request().method() === 'GET') await route.fulfill({ status: 503 });
      else await route.continue();
    };
    await page.route(`**${path}`, unavailable);
    const save = productPatch(page, path);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const saved = await save;
    expect(saved.status()).toBe(200);
    expect(saved.request().postDataJSON()).toMatchObject({ expectedVersion: hidden.version });
    expect(await saved.json()).toMatchObject({ name: 'Saved after Status', status: 'hidden' });

    const retryReload = page.getByRole('alert').getByRole('button', { name: 'Reload' });
    await expect(retryReload).toBeVisible({ timeout: 20000 });
    await expect(name).toHaveValue('Saved after Status');
    const repeat = productPatch(page, path);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await repeat).status()).toBe(409);
    await expect(message).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reload', exact: true })).toHaveCount(1);
    await page.unroute(`**${path}`, unavailable);
    await retryReload.click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    await name.fill('Unsaved before archive');
    expect((await context.request.delete(path, { headers })).status()).toBe(204);
    const archived = productPatch(page, path);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await archived).status()).toBe(409);
    await message.getByRole('button', { name: 'Reload' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Product not found' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reload', exact: true })).toHaveCount(0);
    await expect(name).toHaveValue('Unsaved before archive');
    await expect(page.getByRole('link', { name: 'Back to products' })).toBeVisible();
  } finally {
    const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
    try {
      await database.pool.query(
        "delete from outbox_events where store_id=$1 and payload->>'productId'=$2",
        [storeId, id],
      );
      await database.pool.query(
        'delete from stock_movements where store_id=$1 and variant_id in (select id from product_variants where store_id=$1 and product_id=$2)',
        [storeId, id],
      );
      await database.pool.query(
        'delete from product_variants where store_id=$1 and product_id=$2',
        [storeId, id],
      );
      await database.pool.query('delete from products where store_id=$1 and id=$2', [storeId, id]);
    } finally {
      await database.pool.end();
    }
  }
});

function productPatch(page: Page, path: string) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === path && response.request().method() === 'PATCH',
  );
}

async function changeStatus(page: Page, path: string) {
  const changed = productPatch(page, path);
  await page.getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'Hidden', exact: true }).click();
  return changed;
}
