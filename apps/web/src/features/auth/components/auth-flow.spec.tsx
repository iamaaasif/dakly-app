// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SignInScreen } from './sign-in-screen';
import { SignUpScreen } from './sign-up-screen';
import { PasswordResetConfirm } from './password-reset-confirm';
import type { ReactNode } from 'react';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function show(children: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>);
}
describe('Sign in', () => {
  it('offers real password, code and recovery entry points without requiring registration config', () => {
    show(<SignInScreen config={{ legal: null, googleClientId: null }} />);
    expect(screen.getByLabelText('Mobile number')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Get a code' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toBeTruthy();
    expect(screen.getByText('Google sign-in is currently unavailable.')).toBeTruthy();
  });
  it.each([
    {
      method: 'phone' as const,
      mode: 'password',
      target: '01712345678',
      path: '/api/auth/password',
    },
    {
      method: 'email' as const,
      mode: 'password',
      target: 'rina@example.test',
      path: '/api/auth/password',
    },
    {
      method: 'phone' as const,
      mode: 'code',
      target: '01712345678',
      path: '/api/auth/code/verify',
    },
    {
      method: 'email' as const,
      mode: 'code',
      target: 'rina@example.test',
      path: '/api/auth/email/code/verify',
    },
  ])(
    'requires the second factor after $method $mode sign-in',
    async ({ method, mode, target, path }) => {
      const sent: { path: string; input: Record<string, unknown> }[] = [];
      vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
        sent.push({ path: url, input: JSON.parse(String(options.body)) });
        return url === path
          ? Response.json({ status: 'totp_required', challengeId: 'a'.repeat(43) }, { status: 202 })
          : new Response(null, { status: 204 });
      });
      show(<SignInScreen config={{ legal: null, googleClientId: null }} method={method} />);
      const user = userEvent.setup();
      await user.type(
        screen.getByLabelText(method === 'phone' ? 'Mobile number' : 'Email'),
        target,
      );
      await user.click(screen.getByLabelText('Keep me signed in on this device'));
      if (mode === 'password') {
        await user.type(screen.getByLabelText('Password'), 'my-password123');
        await user.click(screen.getByRole('button', { name: 'Sign in' }));
      } else {
        await user.click(screen.getByRole('button', { name: 'Get a code' }));
        await user.type(await screen.findByLabelText('Sign-in code'), '123456');
        await user.click(screen.getByRole('button', { name: 'Verify code' }));
      }
      await screen.findByLabelText('Authenticator or backup code');
      expect(sent.at(-1)?.path).toBe(path);
      expect(sent.at(-1)?.input.isRemembered).toBe(true);
      expect(screen.queryByLabelText('Password')).toBeNull();
      expect(window.location.search).toBe('');
      expect(window.localStorage.length).toBe(0);
    },
  );
  it('keeps the remembered choice visible when changing the contact method', async () => {
    const client = new QueryClient();
    const view = (method: 'phone' | 'email') => (
      <QueryClientProvider client={client}>
        <SignInScreen config={{ legal: null, googleClientId: null }} method={method} />
      </QueryClientProvider>
    );
    const rendered = render(view('phone'));
    await userEvent.click(screen.getByLabelText('Keep me signed in on this device'));
    rendered.rerender(view('email'));
    expect(
      (screen.getByLabelText('Keep me signed in on this device') as HTMLInputElement).checked,
    ).toBe(true);
  });
  it('maps API field errors back to the input without leaving the form', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Check the fields.',
            fields: [{ path: 'identifier', message: 'Use your verified contact.' }],
          },
        },
        { status: 400 },
      ),
    );
    show(<SignInScreen config={{ legal: null, googleClientId: null }} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mobile number'), '01712345678');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Mobile number').getAttribute('aria-invalid')).toBe('true'),
    );
    expect(screen.getByText('Use your verified contact.')).toBeTruthy();
  });
  it('blocks registration without published legal documents', () => {
    show(<SignUpScreen config={{ legal: null, googleClientId: null }} />);
    expect(screen.getByRole('status').textContent).toContain('unavailable');
    expect(screen.queryByRole('button', { name: 'Send verification code' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Terms' })).toBeNull();
  });
  it('requires the second factor after a password reset', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ status: 'totp_required', challengeId: 'b'.repeat(43) }, { status: 202 }),
    );
    const messages: unknown[] = [];
    class Channel {
      postMessage(value: unknown) {
        messages.push(value);
      }
      close() {}
    }
    vi.stubGlobal('BroadcastChannel', Channel);
    show(<PasswordResetConfirm identifier="01712345678" />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Reset code'), '123456');
    await user.type(screen.getByLabelText('New password'), 'new-password123');
    await user.type(screen.getByLabelText('Confirm password'), 'new-password123');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));
    await screen.findByLabelText('Authenticator or backup code');
    expect(messages).toEqual(['changed']);
    expect(screen.queryByText('Your password has been reset. You are signed in.')).toBeNull();
  });
});
