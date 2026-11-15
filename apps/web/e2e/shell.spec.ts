import { randomInt } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { createDatabase } from '@dakly/db/client';
import type { SessionContext } from '@dakly/contracts/sessions';

async function verifyOnFocus(page: Page) {
  const response = page.waitForResponse((item) => item.url().endsWith('/api/me/context'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await response).status()).toBe(200);
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
}

async function verifyPausedDraft(page: Page) {
  const input = await page.getByLabel('Name', { exact: true }).elementHandle();
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route('**/api/me/context', async (route) => {
    entered();
    await held;
    await route.continue();
  });
  try {
    const verified = page.waitForResponse((item) => item.url().endsWith('/api/me/context'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await requested;
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible();
    expect(
      await input!.evaluate(
        (element) => element.isConnected && Boolean(element.closest('[inert]')),
      ),
    ).toBe(true);
    await expect(page.getByLabel('Name', { exact: true })).toBeHidden();
    release();
    expect((await verified).status()).toBe(200);
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Unfinished draft');
    expect(
      await input!.evaluate((element) => element === document.querySelector('input[name="name"]')),
    ).toBe(true);
  } finally {
    release();
    await page.unroute('**/api/me/context');
    await input?.dispose();
  }
}

async function verifyPhoneNavigation(page: Page) {
  await page.setViewportSize({ width: 360, height: 900 });
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Navigation' });
  const close = drawer.getByRole('button', { name: 'Close navigation' });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(drawer.getByRole('link', { name: 'Security', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await verifyOnFocus(page);
  await expect(drawer).toBeHidden();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Unfinished draft');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
}

test('preserves a draft on focus, disposes it on shop change and writes only to the verified shop', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    token: string;
    storeIds: [string, string];
  };
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.name));
  try {
    await page.goto('/customers');
    await expect(page).toHaveURL(`${baseURL}/sign-in`);
    await context.addCookies([
      {
        name: 'dakly_session',
        value: fixture.token,
        domain: 'localhost',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await page.goto('/customers');
    const name = page.getByLabel('Name', { exact: true });
    await expect(page.getByRole('combobox', { name: 'Current shop' })).toHaveValue(
      fixture.storeIds[0],
    );
    await expect(page.locator('aside').getByRole('link', { name: 'Support access' })).toBeVisible();
    await name.fill('Unfinished draft');
    await page.getByRole('button', { name: 'Collapse navigation' }).click();
    await verifyPausedDraft(page);
    await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
    await verifyPhoneNavigation(page);
    const response = await context.request.get('/api/me/context');
    expect(response.status()).toBe(200);
    const before = (await response.json()) as SessionContext;
    const oldInput = await name.elementHandle();
    await page
      .getByRole('combobox', { name: 'Current shop' })
      .selectOption({ label: 'Sylhet Books' });
    await expect(page.getByRole('combobox', { name: 'Current shop' })).toHaveValue(
      fixture.storeIds[1],
    );
    await expect(name).toHaveValue('');
    expect(await oldInput!.evaluate((element) => element.isConnected)).toBe(false);
    await oldInput!.dispose();
    await expect(page.locator('aside').getByRole('link', { name: 'Support access' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: 'Collapse navigation' })).toBeVisible();
    const customer = { name: 'সাবিনা', phone: `018${randomInt(10000000, 99999999)}` };
    await name.fill(customer.name);
    await page.getByLabel('Phone', { exact: true }).fill(customer.phone);
    await page.getByRole('button', { name: 'Add customer', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Customer added');
    const created = await database.pool.query(
      'select store_id, name from customers where store_id=any($1::uuid[])',
      [fixture.storeIds],
    );
    expect(created.rows).toEqual([{ store_id: fixture.storeIds[1], name: customer.name }]);
    const stale = await context.request.post('/api/customers', {
      headers: { Origin: baseURL!, 'X-Session-Context': before.contextTag },
      data: { name: 'Stale draft', phone: `019${randomInt(10000000, 99999999)}` },
    });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).error.code).toBe('SESSION_CONTEXT_CHANGED');
    const after = await database.pool.query(
      'select store_id, name from customers where store_id=any($1::uuid[])',
      [fixture.storeIds],
    );
    expect(after.rows).toEqual(created.rows);
    await verifyOnFocus(page);
    await expect(page.getByRole('status')).toHaveText('Customer added');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(pageErrors).toEqual([]);
  } finally {
    await database.pool.end();
  }
});
