import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import type { ContentWriteResult } from '@dakly/contracts/content-writing';
import type { ProductResponse } from '@dakly/contracts/products';
import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('picks an AI description without saving the product', async ({ page, context, baseURL }) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  expect(
    (
      await context.request.post('/api/me/active-store', {
        data: { storeId: fixture.storeIds[0] },
        headers: { Origin: baseURL! },
      })
    ).status(),
  ).toBe(204);
  const { contextTag } = await (await context.request.get('/api/me/context')).json();
  const headers = { Origin: baseURL!, 'X-Session-Context': contextTag };
  const created = await context.request.post('/api/products', {
    headers,
    data: { name: 'Cotton scarf', pricePoisha: 95000, description: 'Original description' },
  });
  expect(created.status()).toBe(201);
  const product = (await created.json()) as ProductResponse;
  const productPath = `/api/products/${product.id}`;
  const options = [
    'A cotton scarf for everyday wear.',
    'An easy-to-style cotton scarf.',
    'Complete your outfit with a cotton scarf.',
  ];
  let showError = true;
  try {
    const noPlan = await context.request.post(`${productPath}/write-description`, {
      headers,
      data: { tone: 'friendly', language: 'en' },
    });
    expect((await noPlan.json()).error.code).toBe('SUBSCRIPTION_NOT_FOUND');

    await page.route(`**${productPath}/write-description`, async (route) => {
      expect(route.request().postDataJSON()).toEqual({ tone: 'friendly', language: 'en' });
      if (showError) {
        showError = false;
        await route.fulfill({
          status: 504,
          json: { error: { code: 'CONTENT_TIMEOUT', message: 'Writing timed out' } },
        });
        return;
      }
      const result: ContentWriteResult = {
        options,
        aiRunId: 'dda05039-d3bc-4699-a31a-bb83c66487fc',
      };
      await route.fulfill({ json: result, headers: { 'x-session-context': contextTag } });
    });

    await page.goto(`/products/${product.id}`);
    await page.getByRole('button', { name: 'Write with AI' }).click();
    const panel = page.getByRole('region', { name: 'Write with AI' });
    await panel.getByRole('button', { name: 'Write 3 options' }).click();
    await panel.getByRole('button', { name: 'Try again' }).click();
    await expect(panel.getByText(options[2]!)).toBeVisible();
    await expect(panel.getByText('AI options')).toBeVisible();

    const evidence = resolve(process.cwd(), '../../docs/design/evidence/soc-4');
    await mkdir(evidence, { recursive: true });
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await panel.scrollIntoViewIfNeeded();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await expect
        .poll(() => panel.evaluate((element) => element.scrollWidth <= element.clientWidth))
        .toBe(true);
      await page.screenshot({ path: resolve(evidence, `product-description-${width}.png`) });
    }

    await panel.getByRole('button', { name: options[1], exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue(options[1]!);
    const beforeSave = await context.request.get(productPath, { headers });
    expect((await beforeSave.json()).description).toBe('Original description');
    await page.getByRole('button', { name: 'Save product' }).click();
    await expect(page.getByRole('button', { name: 'Save product' })).toBeDisabled();
    await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue(options[1]!);
    await expect
      .poll(
        async () =>
          (await (await context.request.get(productPath, { headers })).json()).description,
      )
      .toBe(options[1]);
  } finally {
    const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
    try {
      const storeId = fixture.storeIds[0];
      await database.pool.query(
        "delete from outbox_events where store_id=$1 and payload->>'productId'=$2",
        [storeId, product.id],
      );
      await database.pool.query(
        'delete from product_variants where store_id=$1 and product_id=$2',
        [storeId, product.id],
      );
      await database.pool.query('delete from products where store_id=$1 and id=$2', [
        storeId,
        product.id,
      ]);
    } finally {
      await database.pool.end();
    }
  }
});
