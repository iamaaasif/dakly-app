import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('opens the AI agent drawer, saves a switch and keeps it after a reload', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const [storeId] = fixture.storeIds;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  try {
    await database.pool.query("update stores set extensions = array['chats'] where id = $1", [
      storeId,
    ]);
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
          headers: { Origin: baseURL! },
          data: { storeId },
        })
      ).status(),
    ).toBe(204);
    await page.goto('/chats');
    await page.getByRole('link', { name: 'AI agent' }).click();
    await expect(page).toHaveURL(/agent=settings/);
    const drawer = page.getByRole('dialog', { name: 'Dakly AI agent' });
    await expect(drawer.getByRole('tab', { name: 'Settings' })).toBeVisible();
    await expect(drawer.getByRole('switch', { name: /AI auto-reply/ })).toBeVisible();
    await capture(page, 'settings');
    await drawer.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await expect(drawer.getByRole('button', { name: 'Save changes' })).toBeInViewport();
    await capture(page, 'settings-bottom', () =>
      drawer.evaluate((element) => element.scrollTo(0, element.scrollHeight)),
    );
    await drawer.evaluate((element) => element.scrollTo(0, 0));

    await drawer.getByRole('switch', { name: /AI auto-reply/ }).click();
    await drawer.getByRole('switch', { name: /Take orders/ }).click();
    await drawer.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('AI agent settings saved.', { exact: true })).toBeVisible();

    await page.reload();
    const reloaded = page.getByRole('dialog', { name: 'Dakly AI agent' });
    await expect(reloaded.getByRole('switch', { name: /AI auto-reply/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(reloaded.getByRole('switch', { name: /Take orders/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  } finally {
    await database.pool.query('delete from ai_rule_changes where store_id = $1', [storeId]);
    await database.pool.query('delete from audit_log where store_id = $1 and action like $2', [
      storeId,
      'ai_agent.%',
    ]);
    await database.pool.query('delete from ai_agent_settings where store_id = $1', [storeId]);
    await database.pool.end();
  }
});

async function capture(page: Page, screen: string, afterResize?: () => Promise<unknown>) {
  const evidence = process.env.AI8_SCREENSHOT_DIR;
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await afterResize?.();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: resolve(evidence, `${screen}-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}
