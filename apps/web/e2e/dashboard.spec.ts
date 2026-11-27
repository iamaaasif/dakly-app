import { createHash } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

import { scrubPage } from './auth-browser';

test('shows the compact dashboard and keeps figures scoped to the selected shop', async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const [ownerShop, marketerShop] = fixture.storeIds;
  try {
    await database.pool.query(
      `insert into store_daily_metrics (store_id,day,metric,dimension,value)
       values ($1,(now() at time zone 'Asia/Dhaka')::date,'sales','manual',34280000),
              ($1,(now() at time zone 'Asia/Dhaka')::date,'lifecycle','stopped_buying',128)`,
      [ownerShop],
    );
    await context.addCookies([
      {
        name: 'dakly_session',
        value: fixture.token,
        url: baseURL!,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');
    await expect(page.getByText(/^Good (morning|afternoon|evening), রিনা$/)).toBeVisible();
    const overview = page.getByRole('region', { name: 'Shop overview' });
    const tasks = page.getByRole('region', { name: 'Your to-do list' });
    await expect(overview.getByText('৳3,42,800', { exact: true })).toBeVisible();
    await expect(tasks.getByText('Win back 128 customers')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Quick actions' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Chat with Dakly support on WhatsApp' }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Reporting period' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Reports' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Ask Dakly AI' })).toHaveCount(0);
    for (const [width, columns] of [
      [320, 1],
      [390, 1],
      [768, 1],
      [1024, 1],
      [1100, 1],
      [1180, 1],
      [1280, 2],
      [1440, 2],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await overview.evaluate((element) => ({
        columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
        overflows: document.documentElement.scrollWidth > innerWidth,
        compact: element.getBoundingClientRect().width < 580,
      }));
      expect(
        { columns: layout.columns, overflows: layout.overflows },
        `Dashboard layout at ${width}px`,
      ).toEqual({ columns, overflows: false });
      const actionColumns = await tasks.evaluate(
        (element) => getComputedStyle(element.parentElement!).gridTemplateColumns.split(' ').length,
      );
      const values = await overview.locator('[title]').evaluateAll((elements) =>
        elements.map((element) => ({
          top: element.getBoundingClientRect().top,
          tileWidth: element.closest('a')!.getBoundingClientRect().width,
        })),
      );
      const aligned = (layout.compact ? values.slice(1) : values).map(({ top }) => top);
      const valueAlignment = Math.max(...aligned) - Math.min(...aligned);
      if (process.env.DASHBOARD_EVIDENCE && [320, 390, 768, 1180, 1440].includes(width)) {
        await page.screenshot({ path: testInfo.outputPath(`layout-${width}.png`), fullPage: true });
      }
      expect.soft(actionColumns, `Action columns at ${width}px`).toBe(columns);
      expect.soft(valueAlignment, `Overview values at ${width}px`).toBeLessThanOrEqual(1);
      if (layout.compact) {
        const [sales, orders, chats] = values;
        expect.soft(sales!.top, `Sales leads at ${width}px`).toBeLessThan(orders!.top);
        expect
          .soft(sales!.tileWidth, `Sales fills the row at ${width}px`)
          .toBeGreaterThan(orders!.tileWidth);
        expect
          .soft(
            Math.abs(orders!.tileWidth - chats!.tileWidth),
            `Matching queue tiles at ${width}px`,
          )
          .toBeLessThanOrEqual(1);
      }
    }
    await page.setViewportSize({ width: 1180, height: 900 });
    await page.getByRole('button', { name: 'Collapse navigation' }).click();
    await expect
      .poll(() =>
        overview.evaluate(
          (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
        ),
      )
      .toBe(2);
    await page.getByRole('button', { name: 'Expand navigation' }).click();
    await expect
      .poll(() =>
        overview.evaluate(
          (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
        ),
      )
      .toBe(1);
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('combobox', { name: 'Current shop' }).selectOption(marketerShop);
    await expect(overview.getByText('Sales in 30 days', { exact: true })).toHaveCount(0);
    await expect(overview.getByText('৳3,42,800', { exact: true })).toHaveCount(0);
    await expect(overview.getByText('New orders', { exact: true })).toHaveCount(0);
    await expect(tasks.getByText('Win back 128 customers')).toHaveCount(0);
  } finally {
    await scrubPage(page);
    await database.pool.query('update sessions set active_store_id=$1 where token_hash=$2', [
      ownerShop,
      createHash('sha256').update(fixture.token).digest(),
    ]);
    await database.pool.query('delete from store_daily_metrics where store_id=any($1::uuid[])', [
      fixture.storeIds,
    ]);
    await database.pool.end();
  }
});
