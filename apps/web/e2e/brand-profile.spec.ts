import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test, expect, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

const evidence = resolve(process.cwd(), '../../docs/design/evidence/soc-5-content-studio-brand');

async function capture(page: Page, name: string) {
  await mkdir(evidence, { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [360, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.mouse.move(width - 1, height - 1);
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

test('saves the brand profile', async ({ page, context, baseURL }) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const storeId = fixture.storeIds[0];
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
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
    expect(
      (
        await context.request.post('/api/me/active-store', {
          data: { storeId },
          headers: { Origin: baseURL! },
        })
      ).status(),
    ).toBe(204);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/content-studio?tab=brand');
    await expect(page.getByLabel('Who your customers are')).toBeVisible();
    await capture(page, 'brand-profile');

    await page.getByLabel('Who your customers are').fill('Women and men aged 22-40 in Dhaka');
    await page.getByRole('button', { name: 'Warm' }).click();
    await page.getByLabel('Words you like to use').fill('comfort, everyday style');
    await page.getByLabel('Words to never use').fill('cheap, guaranteed');
    await page.getByLabel('In English').fill('Inbox us to order.');
    await page.getByRole('button', { name: 'Save brand profile' }).click();
    await expect(page.getByText('Brand profile saved')).toBeVisible();
    const saved = await database.pool.query(
      'select voice, audience, preferred_words, words_to_avoid, call_to_action_en from brand_profiles where store_id=$1',
      [storeId],
    );
    expect(saved.rows).toEqual([
      {
        voice: 'Warm',
        audience: 'Women and men aged 22-40 in Dhaka',
        preferred_words: ['comfort', 'everyday style'],
        words_to_avoid: ['cheap', 'guaranteed'],
        call_to_action_en: 'Inbox us to order.',
      },
    ]);
    await page.reload();
    await expect(page.getByLabel('Words to never use')).toHaveValue('cheap, guaranteed');
  } finally {
    await database.pool.query('delete from brand_profiles where store_id=$1', [storeId]);
    await database.pool.end();
  }
});
