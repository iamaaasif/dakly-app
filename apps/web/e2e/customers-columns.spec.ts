import { randomInt } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

test.use({ screenshot: 'off' });

test('shows the columns picked in the Columns menu and keeps them in the address', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const phone = `017${randomInt(10000000, 99999999)}`;
  const search = `${randomInt(100000, 999999)}`;
  const name = `Arif Chowdhury ${search}`;
  const evidence = resolve(process.cwd(), '../../docs/design/evidence/cus-17');
  await mkdir(evidence, { recursive: true });
  try {
    const { rows } = await database.pool.query<{ id: string }>(
      `insert into contacts(id,store_id,name,phone,whatsapp_phone,email,district,source,kind,tags)
       values(gen_random_uuid(),$1,$2,$3,$3,'arif@example.test','Sylhet','messenger','customer',array['wholesale'])
       returning id`,
      [fixture.storeIds[0], name, phone],
    );
    await database.pool.query(
      `insert into contact_stats(contact_id,store_id,orders_count,net_spend_poisha,last_order_at,lifecycle_stage)
       values($2,$1,1,150000,now(),'new')
       on conflict (contact_id) do update set orders_count=1, net_spend_poisha=150000, last_order_at=now(), lifecycle_stage='new'`,
      [fixture.storeIds[0], rows[0]!.id],
    );
    await database.pool.query(
      `insert into consents(id,store_id,contact_id,channel,status,source)
       values(gen_random_uuid(),$1,$2,'whatsapp','granted','manual'),(gen_random_uuid(),$1,$2,'sms','withdrawn','manual')`,
      [fixture.storeIds[0], rows[0]!.id],
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
    const selected = await context.request.post('/api/me/active-store', {
      headers: { Origin: baseURL! },
      data: { storeId: fixture.storeIds[0] },
    });
    expect(selected.status()).toBe(204);

    // An open menu hides the page from role queries, so the table is found by tag.
    const table = page.locator('table');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/customers?search=${encodeURIComponent(name)}`);
    await expect(page.getByRole('link', { name })).toBeVisible();
    await expect(table.locator('th', { hasText: 'Email' })).toBeVisible();
    await expect(table.locator('th', { hasText: 'Consent' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Columns' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Consent' }).click();
    await expect(page).toHaveURL(
      /columns=phone%2Cwhatsapp%2Cemail%2Clocation%2Csource%2Ctags%2Cconsent/,
    );
    await expect(page).toHaveURL(/search=/);
    await expect(table.getByText('arif@example.test')).toBeVisible();
    await expect(table.getByText('Sylhet')).toBeVisible();
    await expect(table.getByText('Messenger')).toBeVisible();
    await expect(table.getByText('wholesale')).toBeVisible();
    await expect(table.locator('tbody').getByText('WhatsApp', { exact: true })).toBeVisible();
    // A withdrawn answer is not consent.
    await expect(table.getByText('SMS')).toHaveCount(0);
    await expect(page.getByRole('menuitemcheckbox', { name: 'Source' })).toBeVisible();
    await page.screenshot({ path: resolve(evidence, 'columns-open-1440x900.png') });

    await page.keyboard.press('Escape');
    await page.screenshot({ path: resolve(evidence, 'columns-all-1440x900.png') });
    await page.reload();
    await expect(table.getByText('arif@example.test')).toBeVisible();

    await page.getByRole('button', { name: 'Columns' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Phone' }).click();
    await expect(table.locator('th', { hasText: 'Phone' })).toHaveCount(0);

    await page.setViewportSize({ width: 360, height: 800 });
    await page.keyboard.press('Escape');
    await page.goto(
      `/customers?search=${encodeURIComponent(name)}&columns=phone%2Cwhatsapp%2Cemail%2Clocation%2Csource%2Ctags%2Cconsent`,
    );
    await expect(page.getByRole('listitem').getByText('arif@example.test')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.screenshot({ path: resolve(evidence, 'columns-all-360x800.png') });
    await page.getByRole('button', { name: 'Columns' }).click();
    await page.screenshot({ path: resolve(evidence, 'columns-open-360x800.png') });
  } finally {
    await database.pool.query('delete from contacts where store_id=$1 and phone=$2', [
      fixture.storeIds[0],
      phone,
    ]);
    await database.pool.end();
  }
});
