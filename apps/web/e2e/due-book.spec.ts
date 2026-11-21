import { randomInt, randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

// The customers and amounts of the design image.
const owing = [
  { name: 'Shila Rani', phone: '01687334210', taka: 2100, days: 72, reminded: 40 },
  { name: 'Mitu apa', phone: '01556781230', taka: 1850, days: 6, reminded: null },
  { name: 'Rahim Uddin', phone: '01911602318', taka: 1750, days: 39, reminded: null },
  { name: 'Kamal bhai', phone: '01819776120', taka: 1450, days: 53, reminded: 19 },
  { name: 'Jamal Store', phone: '01722908811', taka: 780, days: 3, reminded: null },
];

test('lists who owes, collects a payment and adds baki by phone', async ({
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
  const newPhone = `017${randomInt(10000000, 99999999)}`;
  try {
    const seed = async (name: string, phone: string, entries: [string, number, number][]) => {
      const id = randomUUID();
      await database.pool.query(
        "insert into contacts(id,store_id,name,phone,source,kind) values($1,$2,$3,$4,'manual','customer')",
        [id, storeId, name, phone],
      );
      for (const [kind, taka, days] of entries)
        await database.pool.query(
          'insert into due_entries(id,store_id,contact_id,kind,amount_poisha,occurred_at,method) values(gen_random_uuid(),$1,$2,$3,$4,$5,$6)',
          [storeId, id, kind, taka * 100, ago(days), kind === 'payment' ? 'cash' : null],
        );
      return id;
    };
    for (const { name, phone, taka, days, reminded } of owing) {
      const id = await seed(name, phone, [['baki', taka, days]]);
      if (reminded !== null)
        await database.pool.query(
          "insert into due_messages(id,store_id,contact_id,kind,body,status,created_at) values(gen_random_uuid(),$1,$2,'reminder','reminder','sent',$3)",
          [storeId, id, ago(reminded)],
        );
    }
    await seed('Karim Paid', '01700000011', [
      ['baki', 1400, 20],
      ['payment', 1400, 1],
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
    const selected = await context.request.post('/api/me/active-store', {
      headers: { Origin: baseURL! },
      data: { storeId },
    });
    expect(selected.status()).toBe(204);

    const shots = process.env.DUE_SHOT_DIR;
    const shoot = async (name: string) => {
      if (!shots) return;
      for (const [width, height] of [
        [1440, 900],
        [360, 800],
      ] as const) {
        await page.setViewportSize({ width, height });
        await page.screenshot({
          path: `${shots}/${name}-${width}x${height}.png`,
          fullPage: width < 800,
        });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    };

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/due-book');
    await expect(page.getByText('৳7,930')).toBeVisible();
    await expect(page.getByText('5 customers', { exact: true })).toBeVisible();
    await expect(page.getByText('৳5,300')).toBeVisible();
    await expect(page.getByText('3 owe for over 30 days')).toBeVisible();
    await expect(page.getByText('৳1,400')).toBeVisible();
    await expect(page.getByRole('link', { name: 'All 5' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Over 30 days 3' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Never reminded 3' })).toBeVisible();
    await expect(page.getByText('Oldest 72 days')).toBeVisible();
    await expect(page.getByText('01556-781230 · Never reminded')).toBeVisible();
    await shoot('list');

    await page.getByRole('button', { name: 'History for Mitu apa' }).click();
    await expect(page.getByText('+৳1,850')).toBeVisible();
    await shoot('history');
    await page.getByRole('button', { name: 'Hide for Mitu apa' }).click();

    await page.getByRole('link', { name: 'Never reminded 3' }).click();
    await expect(page).toHaveURL(/filter=never_reminded/);
    await expect(page.getByRole('button', { name: 'Collect from Shila Rani' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Collect from Mitu apa' })).toBeVisible();
    await shoot('never-reminded');

    await page.getByRole('button', { name: 'Remind Mitu apa' }).click();
    await expect(page.getByRole('dialog', { name: 'Remind Mitu apa' })).toBeVisible();
    await shoot('remind');
    await page.getByRole('button', { name: 'Close dialog' }).click();

    await page.getByRole('button', { name: 'Collect from Mitu apa' }).click();
    const collect = page.getByRole('dialog', { name: 'Collect from Mitu apa' });
    await expect(collect.getByLabel('Amount received (৳)')).toHaveValue('1850');
    await shoot('collect');
    await collect.getByLabel('Amount received (৳)').fill('850');
    await collect.getByRole('radio', { name: 'bKash' }).click();
    await collect.getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByText('Payment recorded from Mitu apa.', { exact: true })).toBeVisible();
    await expect(page.getByText('৳1,000', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Add baki', exact: true }).click();
    const add = page.getByRole('dialog', { name: 'Add baki' });
    await shoot('add-baki');
    await add.getByLabel('Phone').fill(newPhone);
    await add.getByLabel('Name').fill('Nusrat Jahan');
    await add.getByLabel('Amount they owe (৳)').fill('500');
    await add.getByLabel('Note').fill('2 shirts');
    await add.getByRole('button', { name: 'Add baki' }).click();
    await expect(page.getByText('Baki added.', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'All 6' }).click();
    await expect(page.getByRole('button', { name: 'Collect from Nusrat Jahan' })).toBeVisible();

    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    // The shell test counts every contact in these stores, so this one leaves none behind.
    for (const table of ['due_messages', 'due_entries', 'outbox_events', 'contacts'])
      await database.pool.query(`delete from ${table} where store_id=$1`, [storeId]);
    await database.pool.end();
  }
});
