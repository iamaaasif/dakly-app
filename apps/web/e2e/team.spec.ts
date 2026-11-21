import { test, expect, type Page } from '@playwright/test';

import { maskPhone } from '@dakly/contracts/phone';
import type { SessionContext } from '@dakly/contracts/sessions';
import { createDatabase } from '@dakly/db/client';

import { privateInput, scrubPage, messageText } from './auth-browser';

test.use({ screenshot: 'off' });
test.setTimeout(150_000);
test.use({ actionTimeout: 15000 });
type TeamFixture = {
  storeId: string;
  ownerId: string;
  emailUserId: string;
  ownerPhone: string;
  phone: string;
  email: string;
  name: string;
  token: string;
};

test('invites a new recipient, changes live access and transfers ownership to that named member', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const fixture = (JSON.parse(process.env.BROWSER_FIXTURE!) as { team: TeamFixture }).team;
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const recipientContext = await browser.newContext({ baseURL });
  const recipient = await recipientContext.newPage();
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
    await page.goto('/team?tab=roles');
    await page.getByRole('button', { name: 'Create role', exact: true }).click();
    await page.getByLabel('Role name').fill('Team reader');
    await page.getByRole('group', { name: 'Dashboard' }).getByText('View', { exact: true }).click();
    await page.getByRole('group', { name: 'Customers' }).getByText('View', { exact: true }).click();
    await page.getByRole('group', { name: 'Team' }).getByText('View', { exact: true }).click();
    await page.getByRole('button', { name: 'Save role', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Team reader', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Members', exact: true }).click();
    await pausedDialog(page);
    await dialogKeyboard(page);
    await invite(page, fixture.phone, 'Team reader');
    const notice = await messageText(fixture.phone, /Join your team/, seen);
    const link = notice.match(/http[^\s]+(?=\. This link)/)![0];
    // Before hydration Next rewrites the history entry from the URL it read at start, dropping a
    // fragment set meanwhile. The account check is sent only after hydration.
    const checked = recipient.waitForResponse((response) =>
      response.url().endsWith('/api/me/context'),
    );
    await recipient.goto('/invites/accept');
    await checked;
    await recipient.evaluate((url) => location.assign(url), link);
    await expect(
      recipient.getByRole('heading', { name: 'Sign in to Dakly', exact: true }),
    ).toBeVisible();
    expect(await recipient.evaluate(() => location.hash)).toBe('');
    await recipient.getByRole('link', { name: 'Create an account', exact: true }).click();
    await recipient.getByLabel('Full name').fill(fixture.name);
    await privateInput(recipient, 'phone', fixture.phone);
    await privateInput(recipient, 'password', 'Team-browser123');
    await recipient.getByLabel('I agree to the Terms and Privacy documents.').check();
    await recipient.getByRole('button', { name: 'Send verification code' }).click();
    const code = await messageText(fixture.phone, /\b\d{6}\b/, seen);
    await privateInput(recipient, 'code', code.match(/\b\d{6}\b/)![0]);
    await recipient.getByRole('button', { name: 'Verify mobile', exact: true }).click();
    await expect(recipient.getByRole('button', { name: 'Accept invitation' })).toBeVisible();
    const account = await database.pool.query('select id from users where phone=$1 and name=$2', [
      fixture.phone,
      fixture.name,
    ]);
    expect(account.rowCount).toBe(1);
    const recipientId = account.rows[0].id as string;
    expect(
      (await database.pool.query('select id from memberships where user_id=$1', [recipientId]))
        .rowCount,
    ).toBe(0);
    await recipient.getByRole('button', { name: 'Accept invitation' }).click();
    await recipient.getByRole('button', { name: 'Open joined shop' }).click();
    await expect(recipient).toHaveURL(`${baseURL}/dashboard`);
    await recipient.goto('/team');
    await expect(recipient.getByRole('heading', { name: fixture.name, exact: true })).toBeVisible();
    await expect(
      recipient.getByRole('button', { name: 'Invite member', exact: true }),
    ).toBeHidden();
    const oldContext = (await (
      await recipientContext.request.get('/api/me/context')
    ).json()) as SessionContext;
    await page.goto('/team?tab=roles');
    await page.getByRole('button', { name: 'Edit role', exact: true }).click();
    await page.getByRole('group', { name: 'Team' }).getByText('No access', { exact: true }).click();
    await page.getByRole('button', { name: 'Save role', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    const stale = await recipientContext.request.post('/api/members/invites', {
      headers: { Origin: baseURL!, 'X-Session-Context': oldContext.contextTag },
      data: { email: fixture.email, builtInRole: 'admin' },
    });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).error.code).toBe('SESSION_CONTEXT_CHANGED');
    const fresh = (await (
      await recipientContext.request.get('/api/me/context')
    ).json()) as SessionContext;
    expect(fresh.currentStore?.canViewTeam).toBe(false);
    const forbidden = await recipientContext.request.post('/api/members/invites', {
      headers: { Origin: baseURL!, 'X-Session-Context': fresh.contextTag },
      data: { email: fixture.email, builtInRole: 'admin' },
    });
    expect(forbidden.status()).toBe(403);
    await recipient.reload();
    await expect(recipient.getByText('You do not have Team access in this shop.')).toBeVisible();
    await transfer(page, recipient, { fixture, seen });
    const owners = await database.pool.query(
      "select user_id from memberships where store_id=$1 and built_in_role='owner' and status='active'",
      [fixture.storeId],
    );
    expect(owners.rows).toEqual([{ user_id: recipientId }]);
    expect(
      (await database.pool.query('select id from memberships where user_id=$1', [recipientId]))
        .rowCount,
    ).toBe(1);
    await page.goto('/team');
    await expect(page.getByRole('heading', { name: fixture.name, exact: true })).toBeVisible();
    await pictures(page, 'team-members');
    await emailInvitation(page, recipient, { fixture, seen });
  } finally {
    await scrubPage(page);
    await scrubPage(recipient);
    await recipientContext.close().catch(() => undefined);
    await database.pool.end();
  }
});

async function invite(page: Page, target: string, role: string) {
  await page.getByRole('button', { name: 'Invite member', exact: true }).click();
  if (target.includes('@')) await page.getByLabel('Invite by').selectOption('email');
  await privateInput(page, target.includes('@') ? 'email' : 'phone', target);
  await page.getByLabel('Role', { exact: true }).selectOption({ label: role });
  await page.getByRole('button', { name: 'Send invitation', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}
async function dialogKeyboard(page: Page) {
  await page.setViewportSize({ width: 360, height: 900 });
  const trigger = page.getByRole('button', { name: 'Invite member', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Send invitation' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 900 });
}
async function transfer(
  owner: Page,
  recipient: Page,
  { fixture, seen }: { fixture: TeamFixture; seen: Set<string> },
) {
  await owner.goto('/team/ownership');
  await owner
    .getByRole('combobox', { name: 'New Owner', exact: true })
    .selectOption({ label: fixture.name });
  await owner.getByRole('button', { name: 'Send ownership code' }).click();
  await expect(owner.getByLabel('Ownership code')).toBeVisible();
  const notice = await messageText(fixture.ownerPhone, /\b\d{6}\b/, seen);
  await privateInput(owner, 'code', notice.match(/\b\d{6}\b/)![0]);
  await owner.getByRole('button', { name: 'Start ownership transfer' }).click();
  await expect(owner.getByRole('heading', { name: 'Pending ownership transfer' })).toBeVisible();
  await expect(
    owner.getByText(`Transfer to ${fixture.name} (${maskPhone(fixture.phone)})`, { exact: true }),
  ).toBeVisible();
  await expect(owner.getByText(/Recipient account/)).toHaveCount(0);
  await recipient
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await recipient.getByRole('link', { name: 'Ownership transfer' }).click();
  await expect(recipient.getByRole('button', { name: 'Send ownership code' })).toBeHidden();
  await recipient.getByRole('button', { name: 'Review acceptance' }).click();
  await owner.goto('/team');
  await owner.getByRole('button', { name: 'Invite member', exact: true }).click();
  await privateInput(owner, 'phone', '01712345678');
  const oldDraft = await owner.getByLabel('Mobile number').elementHandle();
  await recipient.getByRole('button', { name: 'Accept ownership', exact: true }).click();
  await expect(recipient.getByText('No pending ownership transfer.')).toBeVisible();
  await expect(recipient.getByRole('button', { name: 'Send ownership code' })).toBeVisible();
  const changed = owner.waitForResponse(
    (response) => response.url().endsWith('/api/me/context') && response.status() === 200,
  );
  await owner.evaluate(() => window.dispatchEvent(new Event('focus')));
  await changed;
  await expect(owner.getByRole('dialog')).toBeHidden();
  expect(await oldDraft!.evaluate((input) => input.isConnected)).toBe(false);
  await oldDraft?.dispose();
  await owner.getByRole('button', { name: 'Invite member', exact: true }).click();
  await expect(owner.getByLabel('Mobile number')).toHaveValue('');
  await owner.keyboard.press('Escape');
  await pictures(recipient, 'team-ownership');
}
async function emailInvitation(
  owner: Page,
  recipient: Page,
  { fixture, seen }: { fixture: TeamFixture; seen: Set<string> },
) {
  await invite(owner, fixture.email, 'Support agent');
  const notice = await messageText(fixture.email, /Join your team/, seen);
  const link = notice.match(/http[^\s]+(?=\. This link)/)![0];
  await recipient.evaluate((url) => location.assign(url), link);
  await recipient.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(
    recipient.getByRole('region', { name: 'Join your team' }).getByRole('alert'),
  ).toContainText('verified phone or email');
  await recipient.getByRole('button', { name: 'Use another account' }).click();
  await recipient.getByRole('link', { name: 'Email', exact: true }).click();
  await expect(recipient.getByLabel('Email', { exact: true })).toBeVisible();
  await privateInput(recipient, 'identifier', fixture.email);
  await recipient.getByRole('button', { name: 'Get a code' }).click();
  await expect(recipient.getByLabel('Sign-in code')).toBeVisible();
  const code = await messageText(fixture.email, /\b\d{6}\b/, seen);
  await privateInput(recipient, 'code', code.match(/\b\d{6}\b/)![0]);
  await recipient.getByRole('button', { name: 'Verify code', exact: true }).click();
  await recipient.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(recipient.getByText('Invitation accepted.')).toBeVisible();
}
async function pictures(page: Page, name: string) {
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `e2e-artifacts/${name}-${width}.png` });
  }
}

async function pausedDialog(page: Page) {
  await page.getByRole('button', { name: 'Invite member', exact: true }).click();
  await privateInput(page, 'phone', '01712345678');
  const originalInput = await page.getByLabel('Mobile number').elementHandle();
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
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await requested;
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible();
    release();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Mobile number')).toHaveValue('01712345678');
    expect(
      await originalInput!.evaluate(
        (input) => input === document.querySelector('input[name=phone]'),
      ),
    ).toBe(true);
  } finally {
    release();
    await page.unroute('**/api/me/context');
  }
  await page.route('**/api/me/context', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Try again' } }),
    }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible();
  await page.unroute('**/api/me/context');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Mobile number')).toHaveValue('01712345678');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Invite member', exact: true })).toBeFocused();
  await originalInput?.dispose();
}
