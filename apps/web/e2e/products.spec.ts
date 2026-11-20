import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import type { ProductResponse } from '@dakly/contracts/products';
import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('filters product readiness, adjusts stock and drops drafts when the shop changes', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const products: ProductResponse[] = [];
  const fileIds: string[] = [];
  const evidence = resolve(process.cwd(), '../../docs/design/evidence/prod-4');
  await mkdir(evidence, { recursive: true });
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  async function request(path: string, data: unknown, method = 'POST') {
    const current = await context.request.get('/api/me/context');
    const { contextTag } = await current.json();
    return context.request.fetch(`/api${path}`, {
      method,
      data,
      headers: { Origin: baseURL!, 'X-Session-Context': contextTag },
    });
  }
  async function capture(name: string) {
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.mouse.move(width - 1, height - 1);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      await page.screenshot({ path: resolve(evidence, `${name}-${width}.png`) });
    }
  }
  try {
    expect((await request('/me/active-store', { storeId: fixture.storeIds[0] })).status()).toBe(
      204,
    );
    for (const input of [
      {
        name: 'Cotton Panjabi',
        category: 'Men',
        pricePoisha: 245000,
        compareAtPricePoisha: 295000,
        options: [{ name: 'Size', values: ['M', 'L', 'XL'] }],
        variants: ['M', 'L', 'XL'].map((size) => ({ optionValues: { Size: size } })),
      },
      { name: 'Silk scarf', category: 'Accessories', pricePoisha: 45000, isStockTracked: false },
      {
        name: 'Leather sandal',
        category: 'Accessories',
        pricePoisha: 0,
        isStockTracked: false,
        status: 'hidden',
      },
    ]) {
      const result = await request('/products', input);
      expect(result.status()).toBe(201);
      products.push(await result.json());
    }
    const panjabi = products[0]!;
    for (const [index, quantity] of [4, 2].entries())
      expect(
        (
          await request(`/variants/${panjabi.variants[index]!.id}/stock-adjustments`, {
            quantity,
            reason: 'Opening count',
          })
        ).status(),
      ).toBe(204);
    const png = await readFile(resolve(process.cwd(), 'e2e/fixtures/silk-scarf.png'));
    const uploadInput = { contentType: 'image/png', sizeBytes: png.length };
    const issued = await (
      await request(`/products/${products[1]!.id}/photos/upload-url`, uploadInput)
    ).json();
    expect(
      (
        await context.request.put(issued.uploadUrl, {
          data: png,
          headers: { 'Content-Type': 'image/png' },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request(`/products/${products[1]!.id}/photos/confirm`, {
          ...uploadInput,
          fileId: issued.fileId,
        })
      ).status(),
    ).toBe(201);
    fileIds.push(issued.fileId);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/products');
    await expect(page.getByRole('table', { name: 'Products' })).toBeVisible();
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(4);
    await expect(page.getByRole('table').getByText('Selling', { exact: true })).toBeVisible();
    await expect(page.getByRole('table').getByRole('img', { name: 'Silk scarf' })).toBeVisible();
    await expect
      .poll(() =>
        page
          .getByRole('table')
          .getByRole('img', { name: 'Silk scarf' })
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(1);
    await capture('list');

    await page.getByRole('link', { name: 'Running low', exact: true }).click();
    await expect(page).toHaveURL(/readiness=running_low/);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(2);
    await capture('running-low');
    await page.getByRole('searchbox', { name: 'Search products' }).fill('Cotton');
    await page.getByRole('searchbox', { name: 'Search products' }).press('Enter');
    await expect(page).toHaveURL(/search=Cotton/);
    await expect(page.getByRole('link', { name: 'Running low', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.getByRole('button', { name: 'Adjust stock for Cotton Panjabi, XL' }).click();
    await page.getByLabel('Change in stock').fill('10');
    await page.getByLabel('Reason', { exact: true }).fill('New delivery counted');
    await capture('stock-adjustment');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Adjust stock for Cotton Panjabi, XL' }),
    ).toBeFocused();
    await page.getByRole('button', { name: 'Adjust stock for Cotton Panjabi, XL' }).click();
    await page.getByLabel('Change in stock').fill('10');
    await page.getByLabel('Reason', { exact: true }).fill('New delivery counted');
    await page.getByRole('button', { name: 'Save stock', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Adjust stock for Cotton Panjabi, XL' }),
    ).toHaveText('XL 10');
    await page.getByRole('button', { name: 'Adjust stock for Cotton Panjabi, XL' }).click();
    await page.getByLabel('Reason', { exact: true }).fill('Keep this draft on focus');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByLabel('Reason', { exact: true })).toHaveValue(
      'Keep this draft on focus',
    );
    expect((await request('/me/active-store', { storeId: fixture.storeIds[1] })).status()).toBe(
      204,
    );
    await page.evaluate(() => window.dispatchEvent(new Event('dakly-context-changed')));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('No products on this page.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Adjust stock/ })).toHaveCount(0);
  } finally {
    try {
      await request('/me/active-store', { storeId: fixture.storeIds[0] });
    } finally {
      const ids = products.map((product) => product.id);
      const variants = products.flatMap((product) => product.variants.map((variant) => variant.id));
      await database.pool.query(
        "delete from outbox_events where store_id=$1 and (payload->>'productId'=any($2::text[]) or payload->>'variantId'=any($3::text[]))",
        [fixture.storeIds[0], ids, variants],
      );
      await database.pool.query(
        'delete from stock_movements where store_id=$1 and variant_id=any($2::uuid[])',
        [fixture.storeIds[0], variants],
      );
      await database.pool.query(
        'delete from product_variants where store_id=$1 and product_id=any($2::uuid[])',
        [fixture.storeIds[0], ids],
      );
      await database.pool.query('delete from products where store_id=$1 and id=any($2::uuid[])', [
        fixture.storeIds[0],
        ids,
      ]);
      await database.pool.query('delete from files where store_id=$1 and id=any($2::uuid[])', [
        fixture.storeIds[0],
        fileIds,
      ]);
      await database.pool.end();
    }
  }
});

for (const mode of ['editable', 'read-only'] as const) {
  test(`keeps long ${mode} variant labels inside the phone card`, async ({
    page,
    context,
    baseURL,
  }) => {
    const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
      token: string;
      storeIds: [string, string];
    };
    await context.addCookies([
      {
        name: 'dakly_session',
        value: fixture.token,
        url: baseURL!,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const previous = await (await context.request.get('/api/me/context')).json();
    expect(
      (
        await context.request.post('/api/me/active-store', {
          data: { storeId: fixture.storeIds[0] },
          headers: { Origin: baseURL!, 'X-Session-Context': previous.contextTag },
        })
      ).status(),
    ).toBe(204);
    const session = await (await context.request.get('/api/me/context')).json();
    const label = 'A'.repeat(200);
    const name = `Long variant phone fixture ${mode}`;
    const created = await context.request.post('/api/products', {
      data: {
        name,
        pricePoisha: 10000,
        options: [{ name: 'Size', values: [label] }],
        variants: [{ optionValues: { Size: label } }],
      },
      headers: { Origin: baseURL!, 'X-Session-Context': session.contextTag },
    });
    expect(created.status()).toBe(201);
    const product = (await created.json()) as ProductResponse;
    const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
    try {
      if (mode === 'read-only')
        await database.pool.query(
          "update memberships set built_in_role='support_agent',role_id=null where store_id=$1 and user_id=$2",
          [fixture.storeIds[0], session.user.id],
        );
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto('/products?search=Long');
      if (mode === 'editable') {
        const trigger = page.getByRole('button', {
          name: `Adjust stock for ${name}, ${label}`,
          exact: true,
        });
        await expect(trigger).toBeVisible();
        await trigger.click();
        const dialog = page.getByRole('dialog');
        await expect
          .poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
          .toBe(true);
        const close = dialog.getByRole('button', { name: 'Close dialog' });
        const bounds = await close.evaluate((element) => {
          const button = element.getBoundingClientRect();
          const modal = element.closest('dialog')!.getBoundingClientRect();
          return {
            inside: button.left >= modal.left && button.right <= modal.right,
            width: button.width,
            height: button.height,
          };
        });
        expect(bounds.inside).toBe(true);
        expect(bounds.width).toBeGreaterThanOrEqual(40);
        expect(bounds.height).toBeGreaterThanOrEqual(40);
        await close.click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
      } else {
        await expect(page.getByText(`${label} 0`, { exact: true }).last()).toBeVisible();
        await expect(page.getByRole('button', { name: /Adjust stock/ })).toHaveCount(0);
      }
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
    } finally {
      try {
        await database.pool.query(
          "update memberships set built_in_role='owner',role_id=null where store_id=$1 and user_id=$2",
          [fixture.storeIds[0], session.user.id],
        );
        await database.pool.query(
          "delete from outbox_events where store_id=$1 and payload->>'productId'=$2",
          [fixture.storeIds[0], product.id],
        );
        await database.pool.query(
          'delete from product_variants where store_id=$1 and product_id=$2',
          [fixture.storeIds[0], product.id],
        );
        await database.pool.query('delete from products where store_id=$1 and id=$2', [
          fixture.storeIds[0],
          product.id,
        ]);
      } finally {
        await database.pool.end();
      }
    }
  });
}
