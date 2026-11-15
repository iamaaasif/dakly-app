import { test, expect, type BrowserContext, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

import { scrubPage } from './auth-browser';

test.use({ screenshot: 'off' });
type ReviewFixture = {
  userId: string;
  storeIds: string[];
  grantIds: string[];
  token: string;
  customerId: string;
  staffToken: string;
  assertion: string;
};
const fixture = () =>
  (JSON.parse(process.env.BROWSER_FIXTURE!) as { review: ReviewFixture }).review;
async function exchange(context: BrowserContext, grantId: string, f: ReviewFixture) {
  const handoff = await context.request.post(
    `http://127.0.0.1:4015/admin/support/${grantId}/handoff`,
    {
      headers: {
        Host: 'admin.localhost:3010',
        Origin: 'http://admin.localhost:3010',
        Cookie: `dakly_staff=${f.staffToken}`,
        'cf-access-jwt-assertion': f.assertion,
      },
      data: {},
    },
  );
  expect(handoff.status()).toBe(201);
  const response = await context.request.post('http://localhost:3015/support/exchange', {
    headers: { Origin: 'http://admin.localhost:3010' },
    form: { token: (await handoff.json()).token },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
}

test('fences two real support delegations and discards stale drafts and late results', async ({
  page,
  context,
  baseURL,
}) => {
  const f = fixture();
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const other = await context.newPage();
  let release!: () => void;
  let releaseRead!: () => void;
  try {
    await context.addCookies([
      { name: 'dakly_session', value: f.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
    ]);
    await exchange(context, f.grantIds[0]!, f);
    await page.goto('/support');
    await expect(page.getByLabel('Active Dakly support access')).toContainText('North 1');
    await page.getByLabel('Name', { exact: true }).fill('Stale A draft');
    await page.getByLabel('Phone', { exact: true }).fill('01812345678');
    await page.getByLabel('Customer ID supplied by the shop').fill(f.customerId);
    let readReady!: () => void;
    const readEntered = new Promise<void>((resolve) => {
      readReady = resolve;
    });
    const readHeld = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    await page.route('**/support/api/customers/*', async (route) => {
      const response = await route.fetch();
      readReady();
      await readHeld;
      await route.fulfill({ response }).catch(() => undefined);
    });
    await page.getByRole('button', { name: 'Read customer' }).click();
    await readEntered;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/support/api/session', async (route) => {
      await held;
      await route.continue().catch(() => undefined);
    });
    await exchange(context, f.grantIds[1]!, f);
    await other.goto('/support');
    await expect(other.getByLabel('Active Dakly support access')).toContainText('North 2');
    const stale = page.waitForResponse(
      (response) =>
        response.url().endsWith('/support/api/customers') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Create customer' }).click();
    expect((await stale).status()).toBe(409);
    const counts = await database.pool.query(
      "select (select count(*) from customers where store_id=any($1::uuid[]))::int as customers,(select count(*) from audit_log where store_id=any($1::uuid[]) and action='support.customer_created')::int as creates",
      [f.storeIds.slice(0, 2)],
    );
    expect(counts.rows[0]).toEqual({ customers: 1, creates: 0 });
    release();
    await expect(page.getByLabel('Active Dakly support access')).toContainText('North 2');
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');
    releaseRead();
    await expect(page.getByText('Private A customer', { exact: false })).toHaveCount(0);
    await page.getByLabel('Name', { exact: true }).fill('Explicit B draft');
    await page.getByLabel('Phone', { exact: true }).fill('01812345678');
    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(page.getByText('Customer created:', { exact: false })).toBeVisible();
    const created = await database.pool.query(
      "select store_id from customers where name='Explicit B draft' and store_id=any($1::uuid[])",
      [f.storeIds.slice(0, 2)],
    );
    expect(created.rows.map((row) => row.store_id)).toEqual([f.storeIds[1]]);
    const ordinary = await context.request.get('/api/me/context');
    expect((await ordinary.json()).currentStore.storeId).toBe(f.storeIds.at(-1));
  } finally {
    release?.();
    releaseRead?.();
    await page.unrouteAll({ behavior: 'wait' });
    await scrubPage(page);
    await scrubPage(other);
    await other.close();
    await database.pool.end();
  }
});

test('keeps an off-page current shop readable and loads picker pages deliberately at 360 pixels', async ({
  page,
  context,
  baseURL,
}) => {
  const f = fixture();
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  let listRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/me/stores?')) listRequests++;
  });
  try {
    await context.addCookies([
      { name: 'dakly_session', value: f.token, url: baseURL!, httpOnly: true, sameSite: 'Lax' },
    ]);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto('/security');
    const chooser = page.getByRole('combobox', { name: 'Current shop' });
    await expect(chooser).toHaveValue(f.storeIds.at(-1)!);
    await expect(chooser.locator('option')).toHaveCount(52);
    expect(listRequests).toBe(1);
    const currentName = page.locator('header p').filter({ hasText: 'Dhaka Threads Mirpur South' });
    await expect(currentName).toBeVisible();
    const box = await chooser.boundingBox();
    expect(box!.width).toBeGreaterThan(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.locator('header').screenshot({ path: 'e2e-artifacts/review-picker-360.png' });
    await page.getByRole('button', { name: 'Load more shops' }).click();
    await expect(chooser.locator('option')).toHaveCount(56);
    expect(listRequests).toBe(2);
    await chooser.selectOption(f.storeIds[0]!);
    await expect(chooser).toHaveValue(f.storeIds[0]!);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('header').screenshot({ path: 'e2e-artifacts/review-picker-1280.png' });
    await database.pool.query(
      "update memberships set status='removed' where user_id=$1 and store_id=$2",
      [f.userId, f.storeIds[0]],
    );
    await refresh(page);
    await expect(chooser).toHaveValue('');
    await page.getByRole('button', { name: 'Load more shops' }).click();
    await chooser.selectOption(f.storeIds.at(-1)!);
    await expect(chooser).toHaveValue(f.storeIds.at(-1)!);
  } finally {
    await scrubPage(page);
    await database.pool.end();
  }
});
async function refresh(page: Page) {
  const response = page.waitForResponse((item) => item.url().endsWith('/api/me/context'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await response).status()).toBe(200);
}
