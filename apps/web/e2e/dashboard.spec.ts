import { expect, test } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

import { scrubPage } from './auth-browser';

test('changes the report period and keeps cards scoped to the selected shop', async ({
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
      `with days as (
         select (now() at time zone 'Asia/Dhaka')::date - age as day, age
         from generate_series(0,59) as age
       )
       insert into store_daily_metrics (store_id,day,metric,dimension,value)
       select $1::uuid,day,'orders','',15 + (59-age)/3 + (age*7)%13 from days
       union all
       select $1,day,'sales','manual',500000 + (59-age)*15000 + (age*7)%13*40000 from days
       union all
       select $1,day,'buyer_activity',gen_random_uuid()::text,day-date '1970-01-01' from days
       cross join lateral generate_series(1,3+(59-age)/12+(age*3)%4)
       union all
       select $1,day,'buyer_activity',gen_random_uuid()::text,day-date '1970-01-01'-120 from days
       cross join lateral generate_series(1,4+(59-age)/11+(age*7)%5)`,
      [ownerShop],
    );
    await database.pool.query(
      `insert into store_daily_metrics (store_id,day,metric,dimension,value)
       select $1::uuid,(now() at time zone 'Asia/Dhaka')::date,'lifecycle',stage,count
       from (values ('stopped_buying',128),('slipping_away',96),('bought_once',811),
         ('new',186),('regulars',1124),('best',141)) as stages(stage,count)
       union all
       select $2,(now() at time zone 'Asia/Dhaka')::date,'lifecycle','new',12`,
      [ownerShop, marketerShop],
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
    const figures = page.getByRole('region', { name: 'Key figures' });
    await expect(page.getByText(/^Good (morning|afternoon|evening), রিনা$/)).toBeVisible();
    for (const title of ['Sales', 'Customers who came back', 'New customers', 'Orders']) {
      await expect(figures.getByRole('heading', { name: title, exact: true })).toBeVisible();
    }
    const lifecycle = page.getByRole('region', { name: 'Your customers at a glance' });
    await expect(lifecycle.getByText('2,486 customers', { exact: true })).toBeVisible();
    if (process.env.DASHBOARD_EVIDENCE) {
      await page.evaluate(async () => document.fonts.ready);
      await page.screenshot({ path: testInfo.outputPath('dashboard-1440x900.png') });
    }
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    if (process.env.DASHBOARD_EVIDENCE) {
      await page.screenshot({ path: testInfo.outputPath('dashboard-360x800.png') });
    }
    const period = page.getByRole('navigation', { name: 'Reporting period' });
    await period.getByRole('link', { name: '7 days', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\?period=7$/);
    await expect(figures.getByText('vs previous 7 days')).toHaveCount(4);
    await expect(period.getByRole('link', { name: '7 days', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.goBack();
    await expect(figures.getByText('vs previous 30 days')).toHaveCount(4);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('combobox', { name: 'Current shop' }).selectOption(marketerShop);
    await expect(lifecycle.getByText('12 customers', { exact: true })).toBeVisible();
    await expect(
      figures.getByRole('heading', { name: 'New customers', exact: true }),
    ).toBeVisible();
    await expect(figures.getByRole('heading', { name: 'Sales', exact: true })).toHaveCount(0);
    await expect(figures.getByRole('heading', { name: 'Orders', exact: true })).toHaveCount(0);
  } finally {
    await scrubPage(page);
    await database.pool.query('delete from store_daily_metrics where store_id=any($1::uuid[])', [
      fixture.storeIds,
    ]);
    await database.pool.end();
  }
});
