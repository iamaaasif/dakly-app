// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { DeviceConfirmation } from './device-confirmation';
import { EmailForm } from './email-form';
import { PasswordForm } from './password-form';
import { SecurityScreen } from './security-screen';
import { TotpSetup } from './totp-setup';
import { sessionContextKey } from '@/lib/session-context';

const profile = {
  id: 'account',
  name: 'Rina',
  phone: '01712345678',
  email: 'unverified@example.test',
  hasPassword: true,
  isPhoneVerified: true,
  isEmailVerified: false,
  isTotpEnabled: false,
};
function show(child: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'account-only',
    currentStore: null,
    user: { id: 'account', name: 'Rina' },
    hasMemberships: false,
  });
  render(<QueryClientProvider client={client}>{child}</QueryClientProvider>);
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('requires mailbox verification after current-password proof and tags both account-only writes', async () => {
  const writes: { path: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    expect(init.headers).toMatchObject({ 'X-Session-Context': 'account-only' });
    writes.push({ path, body: JSON.parse(String(init.body)) });
    return new Response(null, { status: 204, headers: { 'x-session-context': 'account-only' } });
  });
  const done = vi.fn();
  show(<EmailForm profile={profile} onDone={done} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Current password'), 'Examplepass1');
  await user.click(screen.getByRole('button', { name: 'Send email verification code' }));
  await screen.findByLabelText('Email verification code');
  expect(done).not.toHaveBeenCalled();
  expect(writes).toEqual([
    { path: '/api/me/email', body: { email: profile.email, currentPassword: 'Examplepass1' } },
  ]);
  await user.type(screen.getByLabelText('Email verification code'), '123456');
  await user.click(screen.getByRole('button', { name: 'Verify email' }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(writes[1]).toEqual({
    path: '/api/me/email/verify',
    body: { email: profile.email, code: '123456' },
  });
});
it('maps rejected password proof to its input without exposing a success state', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json(
      {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Check proof',
          fields: [{ path: 'currentPassword', message: 'Enter your current password' }],
        },
      },
      { status: 400 },
    ),
  );
  show(<PasswordForm profile={profile} onDone={() => undefined} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Current password'), 'wrong');
  await user.type(screen.getByLabelText('New password'), 'Newpass123');
  await user.click(screen.getByRole('button', { name: 'Save password' }));
  await screen.findByText('Enter your current password');
  expect(screen.getByLabelText('Current password').getAttribute('aria-invalid')).toBe('true');
});
it('uses fresh proof before exposing enrollment and confirms the actual setup id', async () => {
  const writes: unknown[] = [];
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    writes.push(JSON.parse(String(init.body)));
    return Response.json(
      path.endsWith('/setup')
        ? { setupId: 'a'.repeat(43), uri: 'otpauth://totp/Dakly?secret=JBSWY3DPEHPK3PXP' }
        : { backupCodes: Array.from({ length: 10 }, (_, i) => String(i).repeat(20)) },
      { headers: { 'x-session-context': 'account-only' } },
    );
  });
  let backupCount = 0;
  show(
    <TotpSetup
      profile={profile}
      onConfirmed={(codes) => {
        backupCount = codes.length;
      }}
    />,
  );
  const user = userEvent.setup();
  expect(screen.queryByLabelText('Authenticator setup key')).toBeNull();
  await user.type(screen.getByLabelText('Current password'), 'Examplepass1');
  await user.click(screen.getByRole('button', { name: 'Start authenticator setup' }));
  expect(await screen.findByLabelText('Authenticator setup key')).toBeTruthy();
  await user.type(screen.getByLabelText('Authenticator code'), '123456');
  await user.click(screen.getByRole('button', { name: 'Enable two-step verification' }));
  await waitFor(() => expect(backupCount).toBe(10));
  expect(writes).toEqual([
    { currentPassword: 'Examplepass1' },
    { setupId: 'a'.repeat(43), code: '123456' },
  ]);
});
it('associates rejected mailbox codes with the verification input', async () => {
  vi.stubGlobal('fetch', async (path: string) =>
    path.endsWith('/verify')
      ? Response.json(
          { error: { code: 'AUTH_CODE_INVALID', message: 'The code is incorrect or expired' } },
          { status: 400 },
        )
      : new Response(null, { status: 204, headers: { 'x-session-context': 'account-only' } }),
  );
  show(<EmailForm profile={profile} onDone={() => undefined} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Current password'), 'Examplepass1');
  await user.click(screen.getByRole('button', { name: 'Send email verification code' }));
  await user.type(await screen.findByLabelText('Email verification code'), '123456');
  await user.click(screen.getByRole('button', { name: 'Verify email' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Email verification code').getAttribute('aria-invalid')).toBe(
      'true',
    ),
  );
});

it('keeps unacknowledged backup codes after a failed profile refresh', async () => {
  const prototype = HTMLDialogElement.prototype;
  const originalShow = Object.getOwnPropertyDescriptor(prototype, 'showModal');
  const originalClose = Object.getOwnPropertyDescriptor(prototype, 'close');
  Object.defineProperty(prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      postMessage() {}
      close() {}
    },
  );
  let confirmed = false;
  let refreshed = false;
  vi.stubGlobal('fetch', async (path: string) => {
    if (path.endsWith('/me'))
      return confirmed && !refreshed
        ? Response.json(
            { error: { code: 'UNAVAILABLE', message: 'Could not refresh profile' } },
            { status: 503 },
          )
        : Response.json(
            { ...profile, isTotpEnabled: confirmed },
            { headers: { 'x-session-context': 'account-only' } },
          );
    if (path.endsWith('/confirm')) {
      confirmed = true;
      return Response.json(
        { backupCodes: Array.from({ length: 10 }, (_, i) => String(i).repeat(20)) },
        { headers: { 'x-session-context': 'account-only' } },
      );
    }
    return Response.json(
      { setupId: 'a'.repeat(43), uri: 'otpauth://totp/Dakly?secret=JBSWY3DPEHPK3PXP' },
      { headers: { 'x-session-context': 'account-only' } },
    );
  });
  try {
    show(<SecurityScreen tab="two-step" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Set up authenticator' }));
    await user.type(screen.getByLabelText('Current password'), 'Examplepass1');
    await user.click(screen.getByRole('button', { name: 'Start authenticator setup' }));
    await user.type(await screen.findByLabelText('Authenticator code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Enable two-step verification' }));
    await screen.findByText('Could not refresh profile');
    const receipt = screen.getByRole('list', { name: 'Backup codes' });
    expect(receipt.children).toHaveLength(10);
    refreshed = true;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText('Could not refresh profile')).toBeNull());
    expect(screen.getByRole('list', { name: 'Backup codes' })).toBe(receipt);
    expect(receipt.children).toHaveLength(10);
    await user.click(screen.getByRole('button', { name: 'I saved my backup codes' }));
    expect(screen.queryByRole('list', { name: 'Backup codes' })).toBeNull();
  } finally {
    cleanup();
    if (originalShow) Object.defineProperty(prototype, 'showModal', originalShow);
    else Reflect.deleteProperty(prototype, 'showModal');
    if (originalClose) Object.defineProperty(prototype, 'close', originalClose);
    else Reflect.deleteProperty(prototype, 'close');
  }
});

it('signs out every device from one confirmation and returns to sign in', async () => {
  const writes: string[] = [];
  vi.stubGlobal('fetch', async (path: string) => {
    writes.push(path);
    return new Response(null, { status: 204, headers: { 'x-session-context': 'account-only' } });
  });
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  const assign = vi.fn();
  vi.stubGlobal('location', { assign });
  show(<DeviceConfirmation device="all" onClose={() => undefined} />);
  const user = userEvent.setup();
  expect(screen.getByText(/including this one/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Confirm sign out' }));
  await waitFor(() => expect(assign).toHaveBeenCalledWith('/sign-in'));
  expect(writes).toEqual(['/api/me/sessions/sign-out-all']);
});
