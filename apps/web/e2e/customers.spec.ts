import { randomInt } from 'node:crypto';

import { test, expect } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('adds a contact, lists it as a customer after an order and opens the profile', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const name = `রহিমা আক্তার ${randomInt(100000, 999999)}`;
  const phone = `019${randomInt(10000000, 99999999)}`;
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
    const selected = await context.request.post('/api/me/active-store', {
      headers: { Origin: baseURL! },
      data: { storeId: fixture.storeIds[0] },
    });
    expect(selected.status()).toBe(204);
    await page.goto('/contacts');
    await page.getByRole('button', { name: 'Add contact', exact: true }).click();
    await page.getByRole('button', { name: /Add manually/ }).click();
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Phone', { exact: true }).fill(phone);
    await page.getByRole('button', { name: 'Add customer', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Customer added');

    // A contact is a customer once it has an order, so the list stays empty of it until then.
    await page.goto(`/customers?search=${encodeURIComponent(name)}`);
    await expect(page.getByText('No customers match')).toBeVisible();
    await database.pool.query(
      `insert into contact_stats(contact_id,store_id,orders_count,net_spend_poisha,last_order_at,lifecycle_stage)
       select id,store_id,1,150000,now(),'new' from contacts where store_id=$1 and phone=$2`,
      [fixture.storeIds[0], phone],
    );
    await page.reload();
    const table = page.getByRole('table');
    await expect(table.getByRole('row')).toHaveCount(2);
    await expect(table.getByText('৳1,500')).toBeVisible();
    await table.getByRole('link', { name }).click();

    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByText(`${phone.slice(0, 5)}-${phone.slice(5)}`)).toBeVisible();
    await expect(page.getByText('No chat channels yet.', { exact: false })).toBeVisible();
  } finally {
    // The shell test counts every contact in these stores, so this one leaves no row behind.
    await database.pool.query('delete from contacts where store_id=$1 and phone=$2', [
      fixture.storeIds[0],
      phone,
    ]);
    await database.pool.end();
  }
});
