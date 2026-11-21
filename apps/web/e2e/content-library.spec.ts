import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test, expect, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

const evidence = resolve(process.cwd(), '../../docs/design/evidence/soc-5-content-studio-library');

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

test('lists saved writing, filters it and deletes a piece', async ({ page, context, baseURL }) => {
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
    await database.pool.query(
      `insert into content_pieces(id,store_id,kind,language,body,created_at) values
         (gen_random_uuid(),$1,'facebook_post','en','Winter kurtis are here. 15% off this weekend, cash on delivery.','2026-11-04T06:00:00Z'),
         (gen_random_uuid(),$1,'whatsapp','banglish','Eid offer on silk scarves, order from our inbox.','2026-11-02T06:00:00Z'),
         (gen_random_uuid(),$1,'instagram_caption','en','Meet the hands behind our Jamdani sarees.','2026-10-29T06:00:00Z'),
         (gen_random_uuid(),$1,'sms','en','Back in stock: silk scarves in 6 colours.','2026-10-21T06:00:00Z'),
         (gen_random_uuid(),$1,'product_description','en','Soft cotton, block-printed by hand, with a relaxed fit.','2026-10-14T06:00:00Z')`,
      [storeId],
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/content-studio?tab=library');
    await expect(page.getByRole('article')).toHaveCount(5);
    await capture(page, 'library');

    await page.getByRole('link', { name: /Messages/ }).click();
    await expect(page.getByRole('article')).toHaveCount(2);
    await page.getByLabel('Search saved writing').fill('eid');
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page).toHaveURL(/group=messages&q=eid/);

    await page.goto('/content-studio?tab=library');
    await page.getByRole('button', { name: 'Delete SMS' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(4);
    const left = await database.pool.query('select 1 from content_pieces where store_id=$1', [
      storeId,
    ]);
    expect(left.rowCount).toBe(4);
  } finally {
    await database.pool.query('delete from content_pieces where store_id=$1', [storeId]);
    await database.pool.end();
  }
});
