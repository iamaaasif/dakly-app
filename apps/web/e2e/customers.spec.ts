import { randomInt } from 'node:crypto';

import { test, expect } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('adds a customer, finds it by name and opens the profile', async ({
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
    await page.goto('/customers');
    await page.getByRole('button', { name: 'Add customers' }).click();
    await page.getByRole('button', { name: /Add manually/ }).click();
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Phone', { exact: true }).fill(phone);
    await page.getByRole('button', { name: 'Add customer', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Customer added');

    await page.getByRole('searchbox', { name: 'Search' }).fill(name);
    await page.getByRole('button', { name: 'Search customers' }).click();
    await expect(page).toHaveURL(/\/customers\?search=/);
    const table = page.getByRole('table');
    await expect(table.getByRole('row')).toHaveCount(2);
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
