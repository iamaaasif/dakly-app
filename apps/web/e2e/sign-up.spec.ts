import { test, expect, type Page, type BrowserContext } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

import { privateInput, scrubPage, messageText, authenticatorCode, signOut } from './auth-browser';

test.use({ screenshot: 'off' });
test.setTimeout(150_000);

test('signs up with a real SMS, commits the shop once, and completes public recovery safely', async ({
  page,
  context,
  baseURL,
}) => {
  const fixture = JSON.parse(process.env.BROWSER_FIXTURE!) as {
    registration: { phone: string; name: string; planCode: string };
  };
  const { phone, name } = fixture.registration;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const seen = new Set<string>();
  const password = 'Browser-pass123';
  let otherPage: Page | undefined;
  try {
    await context.route('https://legal.browser.test/**', (route) =>
      route.fulfill({
        contentType: 'text/plain',
        body: 'Browser fixture document. Not published legal terms.',
      }),
    );
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto('/sign-up');
    await expect(page.getByRole('heading', { name: 'Create your free account' })).toBeVisible();
    await page.screenshot({ path: 'e2e-artifacts/signup-360.png' });
    await privateInput(page, 'email', `${name.toLowerCase().replace(/\W+/g, '.')}@browser.test`);
    await privateInput(page, 'password', password);
    await page.getByRole('combobox', { name: 'How did you hear about us?' }).click();
    await page.getByRole('option', { name: 'Facebook', exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Tell us about your business' })).toBeVisible();
    await page.getByLabel('Your name').fill(name);
    await page.getByLabel('Business name').fill('Dhaka Stationery');
    await privateInput(page, 'phone', phone);
    await page.getByLabel('Website or Facebook Page URL (optional)').fill('dhakastationery.test');
    await page.getByRole('radio', { name: /^Products/ }).click();
    await page.getByRole('button', { name: 'Create a free account' }).click();
    await expect(page.getByRole('heading', { name: 'Enter the code we sent you' })).toBeVisible();
    const text = await messageText(phone, /\b\d{6}\b/, seen);
    await privateInput(page, 'code', text.match(/\b\d{6}\b/)![0]);
    await page.getByRole('button', { name: 'Verify mobile', exact: true }).click();
    // The shop is created from the business step, so the owner skips the setup screen.
    await expect(page).toHaveURL(`${baseURL}/dashboard`);
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    const user = await database.pool.query(
      'select id, terms_version, sign_up_source from users where phone=$1 and name=$2',
      [phone, name],
    );
    expect(user.rowCount).toBe(1);
    const userId = user.rows[0].id as string;
    expect(user.rows[0].terms_version).toBe('browser-fixture-v1');
    expect(user.rows[0].sign_up_source).toBe('facebook');
    const store = await database.pool.query(
      'select s.name, s.website_url, s.offering, m.built_in_role, sub.status, p.code from memberships m join stores s on s.id=m.store_id join subscriptions sub on sub.store_id=m.store_id join plans p on p.id=sub.plan_id where m.user_id=$1',
      [userId],
    );
    expect(store.rowCount).toBe(1);
    expect(store.rows[0]).toMatchObject({
      name: 'Dhaka Stationery',
      website_url: 'https://dhakastationery.test',
      offering: 'products',
      built_in_role: 'owner',
      status: 'active',
      code: 'free',
    });
    await screenshots(page);
    otherPage = await context.newPage();
    await otherPage.goto('/dashboard');
    await expect(otherPage.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    const backupCode = await setupAuthenticator(context, baseURL!, password);
    await signOut(page);
    await expect(page).toHaveURL(new RegExp(`^${baseURL}/sign-in(\\?next=.*)?$`));
    await expect(otherPage.getByRole('heading', { name: 'Dashboard', exact: true })).toBeHidden();
    await privateInput(page, 'identifier', phone);
    await privateInput(page, 'password', password);
    await page.getByLabel('Keep me signed in on this device').check();
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
    await privateInput(page, 'code', backupCode);
    const reverified = otherPage.waitForResponse(
      (response) => response.url().endsWith('/api/me/context') && response.status() === 200,
    );
    await page.getByRole('button', { name: 'Finish sign-in' }).click();
    await reverified;
    await expect(
      otherPage.getByRole('heading', { name: 'Choose a shop', exact: true }),
    ).toBeVisible();
    await expect(otherPage.getByRole('heading', { name: 'Dashboard', exact: true })).toBeHidden();
    await page
      .getByRole('combobox', { name: 'Current shop' })
      .selectOption({ label: 'Dhaka Stationery' });
    await expect(otherPage.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(page).toHaveURL(`${baseURL}/dashboard`);
    expect(
      (
        await database.pool.query(
          'select is_remembered from sessions where user_id=$1 and revoked_at is null',
          [userId],
        )
      ).rows.some((row) => row.is_remembered),
    ).toBe(true);
    await signOut(page);
    await expect(page).toHaveURL(new RegExp(`^${baseURL}/sign-in(\\?next=.*)?$`));
    await recoveryProof(page, { phone, password, seen, userId, database, baseURL: baseURL! });
  } finally {
    await scrubPage(page);
    await otherPage?.close();
    await database.pool.end();
  }
});

async function screenshots(page: Page) {
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `e2e-artifacts/dashboard-${width}.png` });
  }
}

async function setupAuthenticator(context: BrowserContext, origin: string, password: string) {
  const setup = await context.request.post('/api/me/totp/setup', {
    headers: { Origin: origin },
    data: { currentPassword: password },
  });
  expect(setup.status()).toBe(200);
  const { setupId, uri } = (await setup.json()) as { setupId: string; uri: string };
  const confirm = await context.request.post('/api/me/totp/confirm', {
    headers: { Origin: origin },
    data: { setupId, code: authenticatorCode(uri) },
  });
  expect(confirm.status()).toBe(200);
  return ((await confirm.json()) as { backupCodes: string[] }).backupCodes[0]!;
}

type RecoveryFixture = {
  phone: string;
  password: string;
  seen: Set<string>;
  userId: string;
  database: ReturnType<typeof createDatabase>;
  baseURL: string;
};
async function requestRecovery(page: Page, fixture: RecoveryFixture) {
  await page.goto('/security/recovery');
  await privateInput(page, 'identifier', fixture.phone);
  await expect
    .poll(
      async () => {
        const response = page.waitForResponse((item) =>
          item.url().endsWith('/api/auth/totp/recovery/code'),
        );
        await page.getByRole('button', { name: 'Send mobile code', exact: true }).click();
        return (await response).status();
      },
      {
        timeout: 40000,
        intervals: [1000, 2000],
        message: 'Wait for the real shared contact resend window',
      },
    )
    .toBe(204);
  await expect(page.getByRole('status')).toHaveText('A mobile code was sent.');
  const text = await messageText(fixture.phone, /\b\d{6}\b/, fixture.seen);
  await privateInput(page, 'phoneCode', text.match(/\b\d{6}\b/)![0]);
  await privateInput(page, 'password', fixture.password);
  await page.getByRole('button', { name: 'Request recovery', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Recovery requested.');
  const recoveryId = await page.locator('dd').nth(0).textContent();
  const completionToken = await page.locator('dd').nth(1).textContent();
  const notice = await messageText(fixture.phone, /cancel: http/, fixture.seen);
  const link = notice.match(/http[^\s]+/)![0];
  return { recoveryId: recoveryId!, completionToken: completionToken!, link };
}

async function recoveryProof(page: Page, fixture: RecoveryFixture) {
  await page.setViewportSize({ width: 360, height: 900 });
  const first = await requestRecovery(page, fixture);
  await page.evaluate((link) => window.location.assign(link), first.link);
  await expect(page.getByRole('button', { name: 'Cancel this recovery request' })).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'e2e-artifacts/recovery-cancel-360.png' });
  const state = async (id: string) =>
    (
      await fixture.database.pool.query(
        'select status, eligible_at from account_recoveries where id=$1 and user_id=$2',
        [id, fixture.userId],
      )
    ).rows[0];
  expect((await state(first.recoveryId)).status).toBe('pending');
  // The worker sets eligibility after it delivers every recovery notice.
  await expect.poll(async () => (await state(first.recoveryId)).eligible_at).not.toBeNull();
  await page.getByRole('button', { name: 'Cancel this recovery request' }).click();
  await expect(page.getByRole('status')).toContainText('cancelled');
  expect((await state(first.recoveryId)).status).toBe('cancelled');
  // A second recovery uses its own completion proof, never the notice cancellation key.
  const second = await requestRecovery(page, fixture);
  await page.goto('/security/recovery?view=complete');
  await privateInput(page, 'recoveryId', second.recoveryId);
  const wrongKey = new URLSearchParams(new URL(second.link).hash.slice(1)).get('cancelToken')!;
  await privateInput(page, 'token', wrongKey);
  await page.getByRole('button', { name: 'Complete recovery', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('incorrect');
  expect((await state(second.recoveryId)).status).toBe('pending');
  await privateInput(page, 'token', second.completionToken);
  await page.getByRole('button', { name: 'Complete recovery', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('seven-day');
  await fixture.database.pool.query(
    "update account_recoveries set eligible_at=now()-interval '1 minute' where id=$1 and user_id=$2 and status='pending' and eligible_at is not null",
    [second.recoveryId, fixture.userId],
  );
  await page.getByRole('button', { name: 'Complete recovery', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Recovery completed.');
  expect((await state(second.recoveryId)).status).toBe('completed');
  expect(
    (
      await fixture.database.pool.query('select totp_enabled_at from users where id=$1', [
        fixture.userId,
      ])
    ).rows[0].totp_enabled_at,
  ).toBeNull();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(`${fixture.baseURL}/sign-in?next=%2Fdashboard`);
}
