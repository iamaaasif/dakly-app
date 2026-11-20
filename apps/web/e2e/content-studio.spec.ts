import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test, expect, type Locator, type Page } from '@playwright/test';

test.use({ screenshot: 'off' });

const evidence = resolve(process.cwd(), '../../docs/design/evidence/soc-5-content-studio-create');

async function capture(page: Page, name: string, scrollTo?: Locator) {
  await mkdir(evidence, { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.mouse.move(width - 1, height - 1);
    if (scrollTo) await scrollTo.scrollIntoViewIfNeeded();
    else await page.evaluate(() => window.scrollTo(0, 0));
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(0);
    await page.screenshot({
      path: resolve(evidence, `${name}-${width}.png`),
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('writes three options from the chosen settings', async ({ page, context, baseURL }) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const storeId = fixture.storeIds[0];
  await context.addCookies([
    {
      name: 'dakly_session',
      value: fixture.token,
      url: baseURL!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  expect(
    (
      await context.request.post('/api/me/active-store', {
        data: { storeId },
        headers: { Origin: baseURL! },
      })
    ).status(),
  ).toBe(204);
  const { contextTag } = await (await context.request.get('/api/me/context')).json();
  await page.route('**/api/content-pieces/generate', (route) =>
    route.fulfill({
      headers: { 'x-session-context': contextTag },
      json: {
        aiRunId: '00000000-0000-4000-8000-000000000001',
        options: [
          'New winter kurtis are here. 15% off this weekend, cash on delivery.',
          'Stay warm in style. Our winter kurtis are 15% off this weekend.',
          'Winter kurtis, 15% off. Order now and pay on delivery.',
        ],
      },
    }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/content-studio');
  await expect(page.getByRole('heading', { name: 'AI Content Studio', level: 1 })).toBeVisible();
  await capture(page, 'create');
  await capture(page, 'create-style', page.getByRole('button', { name: /Write 3 options/ }));

  await page.getByLabel(/Anything else Dakly should know/).fill('New winter kurtis, 15% off');
  const asked = page.waitForRequest('**/api/content-pieces/generate');
  await page.getByRole('button', { name: /Write 3 options/ }).click();
  expect((await asked).postDataJSON()).toEqual({
    operation: 'generate',
    kind: 'facebook_post',
    tone: 'friendly',
    language: 'bn',
    topic: 'New arrival: New winter kurtis, 15% off',
  });
  await expect(page.getByRole('article')).toHaveCount(3);
  await capture(page, 'options');
});
