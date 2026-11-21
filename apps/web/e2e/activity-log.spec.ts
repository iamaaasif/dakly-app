import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

test.use({ screenshot: 'off' });

test('shows the Owner what changed in the shop', async ({ page, context, baseURL }) => {
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
  const evidence = resolve(process.cwd(), '../../docs/design/evidence/acc-13-audit');
  await mkdir(evidence, { recursive: true });

  await page.goto('/activity');
  await expect(page.getByRole('heading', { name: 'Activity log', level: 1 })).toBeVisible();
  await expect(page.getByRole('listitem').first()).toBeVisible();
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({
      path: resolve(evidence, `activity-${width}.png`),
      fullPage: width < 800,
    });
  }
});
