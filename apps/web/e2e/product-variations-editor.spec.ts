import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

test.use({ screenshot: 'off' });

test('builds options with chips, applies a price to all and flags a price below cost', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  await context.addCookies([
    { name: 'dakly_session', value: fixture.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
  ]);
  const evidence = resolve(process.cwd(), '../../docs/design/evidence/dsn-6');
  const ciCopy = resolve(process.cwd(), 'e2e-artifacts/dsn-6');
  await mkdir(evidence, { recursive: true });
  await mkdir(ciCopy, { recursive: true });
  async function capture(screen: string, focus: () => Promise<void>) {
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await focus();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      for (const directory of [evidence, ciCopy])
        await page.screenshot({ path: resolve(directory, `${screen}-${width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  const session = await (await context.request.get('/api/me/context')).json();
  const activated = await context.request.fetch('/api/me/active-store', {
    method: 'POST',
    data: { storeId: fixture.storeIds[0] },
    headers: { Origin: baseURL!, 'X-Session-Context': session.contextTag },
  });
  expect(activated.status()).toBe(204);

  await page.goto('/products/new');
  await page.getByLabel('Title', { exact: true }).fill('Linen shirt');
  await page.getByLabel('Regular price', { exact: true }).fill('1200');
  await page.getByLabel('Product cost', { exact: true }).fill('650');
  await page.getByLabel('Available stock', { exact: true }).fill('12');

  await page.getByRole('button', { name: '+ Color', exact: true }).click();
  const colour = page.getByLabel('Type a value for Color');
  await colour.fill('Black');
  await colour.press('Enter');
  await colour.pressSequentially('White,Silk blue,');
  await colour.press('Backspace');
  await expect(page.getByText('Silk blue')).toBeHidden();
  await capture('option-editor', () => colour.scrollIntoViewIfNeeded());
  await page.getByRole('button', { name: 'Apply', exact: true }).click();

  await page.getByRole('button', { name: '+ Size', exact: true }).click();
  await page.getByLabel('Type a value for Size').fill('S,M,');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await capture('option-cards', () =>
    page.getByRole('list', { name: 'Product options' }).scrollIntoViewIfNeeded(),
  );

  await page
    .getByRole('button', { name: 'Move Size' })
    .dragTo(page.getByRole('button', { name: 'Move Color' }));
  await expect(
    page.getByLabel('Price for Size S').or(page.getByLabel('Price for S / Black')),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Move Size' }).press('ArrowDown');

  await page.getByRole('button', { name: 'Set price', exact: true }).click();
  await page.getByLabel('Set price', { exact: true }).fill('1500');
  await page.getByRole('button', { name: 'Apply to 4' }).click();
  await expect(page.getByLabel('Price for Black / S')).toHaveValue('1500');

  await page.getByLabel('Cost for Black / S').fill('1600');
  await expect(page.getByText('Price is below cost.')).toBeVisible();
  await capture('variant-table', () =>
    page.getByRole('region', { name: 'Black variants' }).scrollIntoViewIfNeeded(),
  );
});
