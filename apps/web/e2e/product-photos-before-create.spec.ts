import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import type { ProductResponse } from '@dakly/contracts/products';
import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

// A 1x1 PNG that differs from the fixture, so the two photos have different bytes.
const tinyPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('adds photos before the product exists, reorders them and attaches them on Create', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const evidence = [
    resolve(process.cwd(), '../../docs/design/evidence/dsn-5'),
    resolve(process.cwd(), 'e2e-artifacts/dsn-5'),
  ];
  await Promise.all(evidence.map((directory) => mkdir(directory, { recursive: true })));
  const confirmed: string[] = [];
  page.on('response', async (response) => {
    if (response.url().endsWith('/api/product-media/confirm') && response.status() < 300)
      confirmed.push(((await response.json()) as { id: string }).id);
  });
  let productId: string | undefined;
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
    const session = await (await context.request.get('/api/me/context')).json();
    const activated = await context.request.fetch('/api/me/active-store', {
      method: 'POST',
      data: { storeId: fixture.storeIds[0] },
      headers: { Origin: baseURL!, 'X-Session-Context': session.contextTag },
    });
    expect(activated.status()).toBe(204);

    await page.goto('/products/new');
    await expect(page.getByRole('heading', { name: 'Media', exact: true })).toBeVisible();
    await page.getByLabel('Title', { exact: true }).fill('Photo first scarf');
    await page.getByLabel('Regular price', { exact: true }).fill('900');
    await capture(page, evidence, 'media-empty');

    // One at a time, so the order the server confirms them in is the tile order.
    const scarf = {
      name: 'silk-scarf.png',
      mimeType: 'image/png',
      buffer: await readFile(resolve(process.cwd(), 'e2e/fixtures/silk-scarf.png')),
    };
    const tiny = {
      name: 'tiny.png',
      mimeType: 'image/png',
      buffer: Buffer.from(tinyPng, 'base64'),
    };
    await page.getByLabel('Add photos').setInputFiles([scarf]);
    await expect.poll(() => confirmed.length).toBe(1);
    await page.getByLabel('Add photos').setInputFiles([tiny]);
    await expect(page.getByRole('img', { name: 'Photo 2' })).toBeVisible();
    await expect.poll(() => confirmed.length).toBe(2);
    await expect(page.getByText('Cover', { exact: true })).toHaveCount(1);
    await capture(page, evidence, 'media-two-photos');

    await page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data }));
    }, tinyPng);
    await expect(page.getByRole('img', { name: 'Photo 3' })).toBeVisible();
    await expect.poll(() => confirmed.length).toBe(3);

    // Remove the pasted photo and bring it back.
    await page.getByRole('button', { name: 'Photo 3 options' }).click();
    await page.getByRole('menuitem', { name: 'Remove' }).click();
    await expect(page.getByRole('img', { name: 'Photo 3' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('img', { name: 'Photo 3' })).toBeVisible();

    // The second photo becomes the cover.
    await page.getByRole('button', { name: 'Photo 2 options' }).click();
    await page.getByRole('menuitem', { name: 'Make cover' }).click();

    await page.getByLabel('Sell price', { exact: true }).fill('800');
    await page.getByLabel('Product cost', { exact: true }).fill('520');
    await page.getByRole('checkbox', { name: 'Eligible AI negotiation' }).click();
    await page.getByLabel('Min price').fill('650');
    await page.getByLabel('Opening offer price').fill('780');
    await expect(page.getByText(/^Opens at/)).toBeVisible();
    await page.getByLabel('Available stock').fill('20');
    await capture(page, evidence, 'editor-filled');

    // Leaving with typing in the form asks first.
    await page.getByRole('link', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page).toHaveURL(/\/products\/new$/);

    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/products') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
    );
    await page.keyboard.press('Control+s');
    const saved = (await (await created).json()) as ProductResponse;
    productId = saved.id;
    expect(saved.photos.map((photo) => photo.id)).toEqual([
      confirmed[1],
      confirmed[0],
      confirmed[2],
    ]);
    await expect(page).toHaveURL(new RegExp(`/products/${productId}$`));
    await expect(page.getByText('3 photos')).toBeVisible();
  } finally {
    try {
      if (productId)
        await deleteProduct(database, fixture.storeIds[0], { productId, fileIds: confirmed });
    } finally {
      await database.pool.end();
    }
  }
});

async function deleteProduct(
  database: ReturnType<typeof createDatabase>,
  store: string,
  created: { productId: string; fileIds: string[] },
) {
  const { productId, fileIds } = created;
  for (const statement of [
    'delete from stock_movements where store_id=$1 and variant_id in (select id from product_variants where store_id=$1 and product_id=$2)',
    "delete from outbox_events where store_id=$1 and payload->>'productId'=$2",
    'delete from product_variants where store_id=$1 and product_id=$2',
    'delete from products where store_id=$1 and id=$2',
  ])
    await database.pool.query(statement, [store, productId]);
  await database.pool.query('delete from files where store_id=$1 and id=any($2::uuid[])', [
    store,
    fileIds,
  ]);
}

async function capture(page: Page, directories: string[], screen: string) {
  // Tall enough to show the whole page without scrolling, since the page scrolls inside its frame.
  for (const [width, height] of [
    [1440, 2300],
    [360, 4600],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.mouse.move(width - 1, height - 1);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    for (const directory of directories)
      await page.screenshot({ path: resolve(directory, `${screen}-${width}.png`) });
  }
}
