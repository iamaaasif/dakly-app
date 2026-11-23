// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SignInScreen } from './sign-in-screen';

vi.mock('next/script', () => ({
  default: function ProviderScript({ onReady }: { onReady: () => void }) {
    useEffect(onReady, [onReady]);
    return null;
  },
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'google');
});
const config = {
  googleClientId: 'fixture.apps.googleusercontent.com',
  legal: {
    termsUrl: 'https://legal.example.test/terms',
    privacyUrl: 'https://legal.example.test/privacy',
    termsVersion: 'fixture-v1',
  },
};
function providerBoundary() {
  let callback: (response: { credential: string }) => void;
  Object.defineProperty(window, 'google', {
    configurable: true,
    value: {
      accounts: {
        id: {
          initialize(input: { callback: typeof callback }) {
            callback = input.callback;
          },
          renderButton(element: HTMLElement) {
            element.replaceChildren();
            const button = document.createElement('button');
            button.textContent = 'Continue with Google';
            button.onclick = () => callback({ credential: 'external-provider-credential' });
            element.append(button);
          },
        },
      },
    },
  });
}
describe('Google identity transitions', () => {
  it.each(['totp_required', 'email_verification_required'])(
    'handles %s without moving a proof to persistent state',
    async (status) => {
      providerBoundary();
      const sent: { path: string; input: Record<string, unknown> }[] = [];
      vi.stubGlobal('fetch', async (path: string, options: RequestInit) => {
        sent.push({ path, input: JSON.parse(String(options.body)) });
        if (path.endsWith('/email/verify') || path.endsWith('/code/verify'))
          return Response.json(
            { status: 'totp_required', challengeId: 'c'.repeat(43) },
            { status: 202 },
          );
        return Response.json(
          {
            status,
            challengeId: 'a'.repeat(43),
            verificationTicket: 'b'.repeat(43),
          },
          { status: 202 },
        );
      });
      render(
        <QueryClientProvider client={new QueryClient()}>
          <SignInScreen config={config} />
        </QueryClientProvider>,
      );
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'Continue with Google' }));
      if (status === 'email_verification_required') {
        await user.type(await screen.findByLabelText('Email verification code'), '123456');
        await user.click(screen.getByRole('button', { name: 'Verify email' }));
      }
      await screen.findByLabelText('Authenticator or backup code');
      expect(sent[0]).toEqual({
        path: '/api/auth/google',
        input: {
          idToken: 'external-provider-credential',
          isRemembered: true,
          termsVersion: 'fixture-v1',
        },
      });
      if (status === 'email_verification_required')
        expect(sent[1]?.input.verificationTicket).toBe('b'.repeat(43));
      expect(window.location.search).toBe('');
      expect(window.localStorage.length).toBe(0);
    },
  );
  it('creates a new account with one click: no password, mobile code or extra form', async () => {
    providerBoundary();
    const sent: string[] = [];
    vi.stubGlobal('fetch', async (path: string) => {
      sent.push(path);
      return new Response(null, { status: 204 });
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SignInScreen config={config} onAuthenticated={() => sent.push('signed-in')} />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(sent).toEqual(['/api/auth/google', 'signed-in']));
    expect(screen.queryByLabelText('Full name')).toBeNull();
    expect(screen.queryByLabelText('6-digit code')).toBeNull();
  });
});
