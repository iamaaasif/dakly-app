// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PasswordReset } from './password-reset';
import { SignInScreen } from './sign-in-screen';
import { SignUpBusinessStep } from './sign-up-business-step';
import { SignUpScreen } from './sign-up-screen';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function show(children: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>);
}
describe('Sign in', () => {
  it('returns an invited recipient to its caller only after authentication', async () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        postMessage() {}
        close() {}
      },
    );
    vi.stubGlobal('fetch', async () => new Response(null, { status: 204 }));
    let completed = false;
    show(
      <SignInScreen
        config={{ legal: null, googleClientId: null }}
        onAuthenticated={() => {
          completed = true;
        }}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Mobile number'), '01712345678');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /^Sign in/ }));
    await waitFor(() => expect(completed).toBe(true));
  });
  it('offers password sign-in and recovery on the page, and the code only inside an invitation', () => {
    show(<SignInScreen config={{ legal: null, googleClientId: null }} />);
    expect(screen.getByLabelText('Email or mobile number')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Get a code by/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /instead/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toBeTruthy();
    expect(screen.queryByText(/Google/)).toBeNull();
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
      show(
        <SignInScreen
          config={{ legal: null, googleClientId: null }}
          method={method}
          onAuthenticated={() => {}}
        />,
      );
      const user = userEvent.setup();
      await user.type(
        screen.getByLabelText(method === 'phone' ? 'Mobile number' : 'Email'),
        target,
      );
      if (mode === 'password') {
        await user.type(screen.getByLabelText('Password'), 'my-password123');
        await user.click(screen.getByRole('button', { name: /^Sign in/ }));
      } else {
        await user.click(screen.getByRole('button', { name: /Get a code by/ }));
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
    ).toBe(false);
  });
  it('lets someone ask for a new sign-in code after the 30 second wait', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const sent: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      sent.push(url);
      return new Response(null, { status: 204 });
    });
    show(
      <SignInScreen config={{ legal: null, googleClientId: null }} onAuthenticated={() => {}} />,
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByLabelText('Mobile number'), '01712345678');
    await user.click(screen.getByRole('button', { name: /Get a code by/ }));
    const resend = await screen.findByRole('button', { name: 'Resend code in 0:30' });
    expect((resend as HTMLButtonElement).disabled).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    await user.click(screen.getByRole('button', { name: 'Resend code' }));
    await screen.findByRole('button', { name: 'Resend code in 0:30' });
    expect(sent).toEqual(['/api/auth/code', '/api/auth/code']);
    vi.useRealTimers();
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
    await user.type(screen.getByLabelText('Email or mobile number'), '01712345678');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /^Log in$/ }));
    await waitFor(() =>
      expect(screen.getByLabelText('Email or mobile number').getAttribute('aria-invalid')).toBe(
        'true',
      ),
    );
    expect(screen.getByText('Use your verified contact.')).toBeTruthy();
  });
  it('blocks registration without published legal documents', () => {
    show(<SignUpScreen config={{ legal: null, googleClientId: null }} />);
    expect(screen.getByRole('status').textContent).toContain('unavailable');
    expect(screen.queryByRole('button', { name: 'Send verification code' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Terms' })).toBeNull();
  });
  it('asks for the email, a valid password and a source before the business step', async () => {
    show(
      <SignUpScreen
        config={{
          legal: { termsUrl: '/terms', privacyUrl: '/privacy', termsVersion: 'v1' },
          googleClientId: null,
        }}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Enter your email address.')).toBeTruthy();
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy();
    expect(screen.getByText('Tell us how you heard about Dakly.')).toBeTruthy();
    await user.type(screen.getByLabelText('Password'), 'abcdefgh');
    expect(await screen.findByText('Add at least one number.')).toBeTruthy();
    const facebook = screen.getByRole('link', { name: 'Sign up with Facebook' });
    expect(facebook.getAttribute('href')).toBe('/api/auth/facebook/start?termsVersion=v1');
  });
  it('requires the second factor after a password reset', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.endsWith('/password-reset/confirm')
        ? Response.json({ status: 'totp_required', challengeId: 'b'.repeat(43) }, { status: 202 })
        : new Response(null, { status: 204 }),
    );
    const messages: unknown[] = [];
    class Channel {
      postMessage(value: unknown) {
        messages.push(value);
      }

      close() {}
    }
    vi.stubGlobal('BroadcastChannel', Channel);
    show(<PasswordReset />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email or mobile number'), '01712345678');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.type(await screen.findByLabelText('6-digit code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText('New password'), 'new-password123');
    await user.type(screen.getByLabelText('Confirm new password'), 'new-password123');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    await screen.findByLabelText('Authenticator or backup code');
    expect(messages).toEqual(['changed']);
    expect(screen.queryByText('Password updated')).toBeNull();
  });
  it('shows a wrong reset code on the password step and returns to the code step', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.endsWith('/password-reset/confirm')
        ? Response.json(
            { error: { code: 'AUTH_CODE_INVALID', message: 'The code is incorrect or expired' } },
            { status: 400 },
          )
        : new Response(null, { status: 204 }),
    );
    show(<PasswordReset />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email or mobile number'), 'owner@example.com');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.type(await screen.findByLabelText('6-digit code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText('New password'), 'new-password123');
    await user.type(screen.getByLabelText('Confirm new password'), 'new-password123');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'That code is wrong or has expired.',
    );
    await user.click(screen.getByRole('button', { name: 'Enter the code again' }));
    expect(await screen.findByLabelText('6-digit code')).toBeTruthy();
  });
  it('sends how the owner heard about Dakly with the sign-up code and keeps the shop details', async () => {
    const requests: unknown[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 204 });
    });
    let sent: unknown;
    show(
      <SignUpBusinessStep
        account={{
          email: 'owner@example.com',
          password: 'abcdefg1',
          source: 'other',
          sourceOther: 'A friend',
        }}
        legal={{ termsUrl: '/terms', privacyUrl: '/privacy', termsVersion: 'v1' }}
        onSent={(value) => {
          sent = value;
        }}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Your name'), 'Rina Akter');
    await user.type(screen.getByLabelText('Business name'), 'Urban Trend');
    await user.type(screen.getByLabelText('Phone number'), '01712345678');
    await user.type(screen.getByLabelText(/Website or Facebook Page/), 'facebook.com/urbantrend');
    await user.click(screen.getByRole('radio', { name: /^Both/ }));
    await user.click(screen.getByRole('button', { name: 'Create a free account' }));
    await waitFor(() => expect(sent).toBeTruthy());
    expect(requests[0]).toMatchObject({
      purpose: 'sign_up',
      phone: '01712345678',
      email: 'owner@example.com',
      source: 'other',
      sourceOther: 'A friend',
    });
    expect(sent).toMatchObject({
      shop: {
        businessName: 'Urban Trend',
        websiteUrl: 'facebook.com/urbantrend',
        offering: 'both',
      },
    });
  });
});
