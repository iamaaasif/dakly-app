import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

test.use({ screenshot: 'off' });

test('turns an extension off and on from its card', async ({ page, context, baseURL }) => {
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
  const evidence = resolve(process.cwd(), '../../docs/design/evidence/acc-13-extensions');
  await mkdir(evidence, { recursive: true });

  await page.goto('/extensions');
  const sales = page.getByRole('switch', { name: 'Sales', exact: true });
  await expect(sales).toBeVisible();
  if ((await sales.getAttribute('aria-checked')) !== 'true') await sales.click();
  await expect(sales).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: 'Physical Shop' })).toBeDisabled();
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({
      path: resolve(evidence, `extensions-${width}.png`),
      fullPage: width < 800,
    });
  }

  await sales.click();
  await expect(sales).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Sales', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await page.getByRole('switch', { name: 'Sales', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Sales', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});
