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

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/extensions');
  const pages = [
    ['Sales', 'Orders'],
    ['Chats', 'Chats'],
    ['Social Auto Post', 'Social hub'],
    ['Physical Shop', 'Due book'],
  ] as const;
  // Switching an extension off hides its menu pages, and on brings them back.
  for (const [extension, menuLink] of pages) {
    const toggle = page.getByRole('switch', { name: extension, exact: true });
    const link = page.getByRole('link', { name: menuLink, exact: true });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(link).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(link).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(link).toBeVisible();
  }
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
});
