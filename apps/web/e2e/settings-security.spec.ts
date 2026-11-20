import { test, expect, type Page } from '@playwright/test';

import { createDatabase } from '@dakly/db/client';

import { privateInput, scrubPage, messageText, authenticatorCode, signOut } from './auth-browser';

test.use({ screenshot: 'off', actionTimeout: 15000 });
test.setTimeout(150_000);
type Fixture = {
  storeId: string;
  ownerId: string;
  emailUserId: string;
  phone: string;
  email: string;
  token: string;
  accountToken: string;
  password: string;
  deviceIds: string[];
};

test('edits settings, verifies the invited mailbox and protects account-only devices with TOTP', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const fixture = (JSON.parse(process.env.BROWSER_FIXTURE!) as { security: Fixture }).security;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const accountContext = await browser.newContext({ baseURL });
  const account = await accountContext.newPage();
  const seen = new Set<string>();
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
    await accountContext.addCookies([
      {
        name: 'dakly_session',
        value: fixture.accountToken,
        url: baseURL!,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await settings(page);
    await deleteTeamRole(page);
    await page.goto('/team');
    await page.getByRole('button', { name: 'Invite member', exact: true }).click();
    await page.getByLabel('Invite by').selectOption('email');
    await privateInput(page, 'email', fixture.email);
    await page.getByLabel('Role', { exact: true }).selectOption('support_agent');
    await page.getByRole('button', { name: 'Send invitation', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    const notice = await messageText(fixture.email, /Join your team/, seen);
    const link = notice.match(/http[^\s]+(?=\. This link)/)![0];
    // Before hydration Next rewrites the history entry from the URL it read at start, dropping a
    // fragment set meanwhile. The account check is sent only after hydration.
    const checked = account.waitForResponse((response) =>
      response.url().endsWith('/api/me/context'),
    );
    await account.goto('/invites/accept');
    await checked;
    await account.evaluate((url) => location.assign(url), link);
    await account.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    await expect(
      account.getByRole('alert').filter({ hasText: 'For an email invitation' }),
    ).toBeVisible();
    expect(
      (
        await database.pool.query('select id from memberships where user_id=$1', [
          fixture.emailUserId,
        ])
      ).rowCount,
    ).toBe(0);
    await verifyEmail(account, { fixture, seen });
    const verified = await database.pool.query(
      'select id,email_verified_at from users where email=$1',
      [fixture.email],
    );
    expect(verified.rows[0].id).toBe(fixture.emailUserId);
    expect(verified.rows[0].email_verified_at !== null).toBe(true);
    const rechecked = account.waitForResponse((response) =>
      response.url().endsWith('/api/me/context'),
    );
    await account.goto('/invites/accept');
    await rechecked;
    await account.evaluate((url) => location.assign(url), link);
    await account.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    await expect(account.getByText('Invitation accepted.')).toBeVisible();
    const joined = await database.pool.query(
      'select user_id from memberships where store_id=$1 and user_id=$2',
      [fixture.storeId, fixture.emailUserId],
    );
    expect(joined.rows[0].user_id).toBe(fixture.emailUserId);
    await devices(account);
    await totp(account, fixture);
    await customSettingsAccess(page, { database, fixture });
  } finally {
    await scrubPage(page);
    await scrubPage(account);
    await accountContext.close().catch(() => undefined);
    await database.pool.end();
  }
});

async function settings(page: Page) {
  await page.goto('/settings');
  await page.getByLabel('Store name').fill('Security browser shop');
  await page.getByLabel('Legal name').fill('Security Books Ltd');
  await page.getByRole('button', { name: 'Save store information' }).click();
  await expect(page.getByText('Store information saved.')).toBeVisible();
  await page.getByLabel('Legal name').clear();
  const saved = page.waitForResponse(
    (response) => response.url().endsWith('/api/store') && response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Save store information' }).click();
  expect((await (await saved).json()).legalName).toBeNull();
  await page.reload();
  await expect(page.getByLabel('Store name')).toHaveValue('Security browser shop');
  await expect(page.getByLabel('Legal name')).toHaveValue('');
  await pictures(page, 'settings-store');
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('link', { name: 'Extensions', exact: true })
    .click();
  await page.getByRole('checkbox', { name: 'Sales', exact: true }).check();
  await page.getByLabel('Chats', { exact: true }).uncheck();
  await page.getByLabel('Social auto-post', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save extensions' }).click();
  await expect(page.getByText('Extensions saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Sales', exact: true })).toBeChecked();
  await expect(page.getByLabel('Chats', { exact: true })).not.toBeChecked();
  await pictures(page, 'settings-extensions');
}

async function verifyEmail(page: Page, { fixture, seen }: { fixture: Fixture; seen: Set<string> }) {
  await page.goto('/security');
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible();
  await pictures(page, 'security-profile');
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await page.getByRole('button', { name: 'Use a verification code instead' }).click();
  await page.getByRole('button', { name: 'Send proof code' }).click();
  const proof = await messageText(fixture.phone, /\b\d{6}\b/, seen);
  await privateInput(page, 'proofCode', proof.match(/\b\d{6}\b/)![0]);
  await page.getByRole('button', { name: 'Send email verification code' }).click();
  await expect(page.getByLabel('Email verification code', { exact: true })).toBeVisible();
  const email = await messageText(fixture.email, /\b\d{6}\b/, seen);
  await privateInput(page, 'code', email.match(/\b\d{6}\b/)![0]);
  await page.getByRole('dialog').getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByText('Email verified.')).toBeVisible();
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await privateInput(page, 'currentPassword', fixture.password);
  await privateInput(page, 'password', fixture.password + '8');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('Password saved.')).toBeVisible();
  fixture.password += '8';
}

async function devices(page: Page) {
  await page.goto('/security?tab=devices');
  await expect(page.getByText('Chrome on Linux · Current device')).toBeVisible();
  await pictures(page, 'security-devices');
  const device = page
    .getByRole('heading', { name: 'Firefox on Windows', exact: true })
    .locator('..');
  await device.getByRole('button', { name: 'Sign out device', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm sign out' }).click();
  await expect(page.getByText('Firefox on Windows', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Sign out other devices' }).click();
  await page.getByRole('button', { name: 'Confirm sign out' }).click();
  await expect(page.getByText('Safari on macOS', { exact: true })).toBeHidden();
  await expect(page.getByText('Chrome on Linux · Current device')).toBeVisible();
}

async function totp(page: Page, fixture: Fixture) {
  await page.goto('/security?tab=two-step');
  await pictures(page, 'security-two-step');
  await page.getByRole('button', { name: 'Set up authenticator', exact: true }).click();
  await privateInput(page, 'currentPassword', fixture.password);
  await page.getByRole('button', { name: 'Start authenticator setup' }).click();
  const secret = await page.getByLabel('Authenticator setup key').inputValue();
  await privateLayout(page, 'Enable two-step verification');
  await privateInput(page, 'code', authenticatorCode('otpauth://totp/Dakly?secret=' + secret));
  await page.getByRole('button', { name: 'Enable two-step verification' }).click();
  const receipt = page.getByRole('list', { name: 'Backup codes' });
  await expect(receipt.getByRole('listitem')).toHaveCount(10);
  const codes = await receipt.getByRole('listitem').allTextContents();
  const verified = page.waitForResponse(
    (response) => response.url().endsWith('/api/me/context') && response.status() === 200,
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await verified;
  await expect(receipt).toBeVisible();
  await expect(receipt.getByRole('listitem')).toHaveCount(10);
  expect((await (await page.request.get('/api/me')).json()).isTotpEnabled).toBe(true);
  await page.getByRole('button', { name: 'I saved my backup codes' }).click();
  await expect(receipt).toBeHidden();
  await signOut(page);
  await passwordSignIn(page, fixture);
  await privateInput(page, 'code', codes[0]!);
  await page.getByRole('button', { name: 'Finish sign-in' }).click();
  await expect(page).toHaveURL(/dashboard/);
  await signOut(page);
  await passwordSignIn(page, fixture);
  await privateInput(page, 'code', codes[0]!);
  await page.getByRole('button', { name: 'Finish sign-in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await privateInput(page, 'code', codes[1]!);
  await page.getByRole('button', { name: 'Finish sign-in' }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto('/security?tab=two-step');
  await page.getByRole('button', { name: 'Disable two-step verification', exact: true }).click();
  await privateInput(page, 'code', codes[2]!);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Disable two-step verification' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Set up authenticator', exact: true }),
  ).toBeVisible();
  await page.goto('/security?tab=history');
  await expect(
    page.getByRole('heading', { name: 'Two-step verification turned on', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Email changed', exact: true })).toBeVisible();
  await pictures(page, 'security-history');
}
async function passwordSignIn(page: Page, fixture: Fixture) {
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await privateInput(page, 'identifier', fixture.phone);
  await privateInput(page, 'password', fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Authenticator or backup code', { exact: true })).toBeVisible();
}
async function customSettingsAccess(
  page: Page,
  { database, fixture }: { database: ReturnType<typeof createDatabase>; fixture: Fixture },
) {
  const result = await database.pool.query(
    "insert into roles(id,store_id,name,permissions) values(gen_random_uuid(),$1,'Settings editor',$2) returning id",
    [fixture.storeId, { storeSettings: 'edit' }],
  );
  await database.pool.query(
    'update memberships set built_in_role=null,role_id=$2 where store_id=$1 and user_id=$3',
    [fixture.storeId, result.rows[0].id, fixture.ownerId],
  );
  await page.goto('/settings?tab=extensions');
  await expect(page.getByRole('checkbox', { name: 'Sales', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save extensions' })).toBeHidden();
  const context = await (await page.request.get('/api/me/context')).json();
  const denied = await page.request.patch('/api/store/extensions', {
    data: { extensions: [] },
    headers: { Origin: 'http://localhost:3015', 'X-Session-Context': context.contextTag },
  });
  expect(denied.status()).toBe(403);
  await page.getByRole('link', { name: 'Store information', exact: true }).click();
  await expect(page.getByLabel('Store name')).toBeEnabled();
}
async function pictures(page: Page, name: string) {
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `e2e-artifacts/${name}-${width}.png`, fullPage: true });
  }
}

async function deleteTeamRole(page: Page) {
  await page.goto('/team?tab=roles');
  await page.getByRole('button', { name: 'Create role', exact: true }).click();
  await page.getByLabel('Role name').fill('Disposable settings role');
  await page.getByRole('button', { name: 'Save role', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page
    .getByRole('article', { name: 'Disposable settings role', exact: true })
    .getByRole('button', { name: 'Delete role', exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete role', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Disposable settings role', exact: true }),
  ).toBeHidden();
}

async function privateLayout(page: Page, submit: string) {
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const dialog = page.getByRole('dialog');
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    const button = dialog.getByRole('button', { name: submit, exact: true });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
  }
}
