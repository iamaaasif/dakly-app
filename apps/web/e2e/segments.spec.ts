import { randomInt, randomUUID } from 'node:crypto';

import { test, expect } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('creates a segment with one tag condition and sees its count', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const storeId = fixture.storeIds[0];
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const tag = `browser-${randomInt(100000, 999999)}`;
  const contactIds = [randomUUID(), randomUUID()];
  try {
    for (const [index, id] of contactIds.entries())
      await database.pool.query(
        "insert into contacts(id,store_id,name,phone,source,kind,tags) values($1,$2,$3,$4,'manual','customer',$5)",
        [
          id,
          storeId,
          `Segment ${index}`,
          `016${randomInt(10000000, 99999999)}`,
          index ? [] : [tag],
        ],
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
    await page.goto('/segments');
    await page.getByRole('link', { name: 'Create segment' }).click();
    await page.getByLabel('Segment name').fill(`Tagged ${tag}`);
    await page.getByRole('group', { name: 'Group 1, condition 1' }).getByLabel('Value').fill(tag);
    await expect(
      page.getByText('Estimated contacts').locator('xpath=following-sibling::p'),
    ).toHaveText('1');
    await page.setViewportSize({ width: 360, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Save segment' }).click();
    await expect(page).toHaveURL(`${baseURL}/segments`);
    await expect(page.getByRole('heading', { name: `Tagged ${tag}`, exact: true })).toBeVisible();
    await expect(page.getByText(`Tag is ${tag}`)).toBeVisible();
    await expect(page.getByText('1 customer matches')).toBeVisible();
    await page.getByRole('button', { name: `Delete Tagged ${tag}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete segment' }).click();
    await expect(page.getByRole('heading', { name: `Tagged ${tag}`, exact: true })).toBeHidden();
  } finally {
    await database.pool.query("delete from segments where store_id=$1 and name like 'Tagged %'", [
      storeId,
    ]);
    await database.pool.query(
      "delete from outbox_events where store_id=$1 and type='segment.saved'",
      [storeId],
    );
    await database.pool.query('delete from contacts where id=any($1::uuid[])', [contactIds]);
    await database.pool.end();
  }
});
