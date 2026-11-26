import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import type { ProductResponse } from '@dakly/contracts/products';
import { createDatabase } from '@dakly/db/client';

import { waitForProductIndex } from './fixtures/product-index';

test.use({ screenshot: 'off' });

test('adds a product on a full page and keeps Save in the top bar', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const evidence = resolve(process.cwd(), '../../docs/design/evidence/prod-17-1');
  const name = 'Cotton shirt page fixture';
  let productId: string | undefined;
  // CI keeps only e2e-artifacts, so each screenshot is also written there.
  const ciCopy = resolve(process.cwd(), 'e2e-artifacts/prod-17-1');
  await mkdir(evidence, { recursive: true });
  await mkdir(ciCopy, { recursive: true });
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  async function capture(screen: string) {
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.mouse.move(width - 1, height - 1);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      for (const directory of [evidence, ciCopy])
        await page.screenshot({ path: resolve(directory, `${screen}-${width}.png`) });
    }
  }
  try {
    const session = await (await context.request.get('/api/me/context')).json();
    const activated = await context.request.fetch('/api/me/active-store', {
      method: 'POST',
      data: { storeId: fixture.storeIds[0] },
      headers: { Origin: baseURL!, 'X-Session-Context': session.contextTag },
    });
    expect(activated.status()).toBe(204);

    await page.goto('/products');
    await page.locator('header').getByRole('button', { name: 'Add product', exact: true }).click();
    await page.getByRole('button', { name: /More details/ }).click();
    await expect(page).toHaveURL(/\/products\/new$/);
    await expect(page.getByRole('heading', { name: 'New product', exact: true })).toBeVisible();
    await expect(page.getByText('Create the product to add photos.')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveText('Hidden');
    await page.getByLabel('Product name', { exact: true }).fill(name);
    await page.getByLabel('Regular price ৳', { exact: true }).fill('600');
    await page.getByLabel('Sell price ৳', { exact: true }).fill('400');
    await page.getByLabel('Product cost ৳', { exact: true }).fill('260');
    await expect(page.getByText('35%')).toBeVisible();
    await capture('new');

    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/products') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
    );
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const saved = (await (await created).json()) as ProductResponse;
    productId = saved.id;
    expect(saved).toMatchObject({
      status: 'hidden',
      pricePoisha: 40000,
      compareAtPricePoisha: 60000,
    });
    await expect(page).toHaveURL(new RegExp(`/products/${productId}$`));
    await waitForProductIndex(database, { storeId: fixture.storeIds[0], id: productId });
    await page.reload();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Media', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await capture('saved');
    await saveNegotiationPrices(page);
  } finally {
    try {
      if (productId) {
        const store = fixture.storeIds[0];
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

async function saveNegotiationPrices(page: Page) {
  const priceCard = page.getByRole('heading', { name: 'Price', exact: true }).locator('..');
  const toggle = priceCard.getByRole('switch', { name: 'Let the AI negotiate' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await priceCard.getByLabel('Opening offer ৳').fill('340');
  await priceCard.getByLabel('Lowest price ৳').fill('240');
  await expect(priceCard.getByText('The lowest price is below the product cost.')).toBeVisible();

  const directories = [
    resolve(process.cwd(), '../../docs/design/evidence/prod-17-5'),
    resolve(process.cwd(), 'e2e-artifacts/prod-17-5'),
  ];
  await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })));
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.mouse.move(width - 1, height - 1);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    for (const directory of directories)
      await priceCard.screenshot({
        path: resolve(directory, `price-negotiation-${width}x${height}.png`),
      });
  }

  const changed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith('/api/products/') &&
      response.request().method() === 'PATCH' &&
      response.status() === 200,
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(await (await changed).json()).toMatchObject({
    negotiationEnabled: true,
    negotiationOpeningPoisha: 34000,
    negotiationFloorPoisha: 24000,
  });
}
