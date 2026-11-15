// @vitest-environment jsdom
import { useEffect } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { InviteEntry } from './invite-entry';
const route = vi.hoisted(() => ({ view: 'phone' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ view: route.view }),
  useRouter: () => ({
    replace: () => {
      route.view = 'phone';
    },
  }),
}));
vi.mock('next/script', () => ({
  default: function ProviderScript({ onReady }: { onReady: () => void }) {
    useEffect(onReady, [onReady]);
    return null;
  },
}));
const config = {
  googleClientId: 'fixture.apps.googleusercontent.com',
  legal: {
    termsUrl: 'https://legal.example.test/terms',
    privacyUrl: 'https://legal.example.test/privacy',
    termsVersion: 'fixture-v1',
  },
};
let client: QueryClient;
afterEach(() => {
  cleanup();
  client?.clear();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'google');
  history.replaceState(null, '', '/');
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});
function show(view: string) {
  route.view = view;
  client = new QueryClient();
  history.replaceState(null, '', `/invites/accept#token=${'a'.repeat(64)}`);
  render(
    <QueryClientProvider client={client}>
      <InviteEntry config={config} />
    </QueryClientProvider>,
  );
}
function transport() {
  let signedIn = false;
  let waiting = false;
  let contextRequests = 0;
  let release: (response: Response) => void = () => {};
  const accepted: unknown[] = [];
  const anonymous = () =>
    Response.json({ error: { code: 'AUTH_REQUIRED', message: 'Sign in' } }, { status: 401 });
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      postMessage() {}
      close() {}
    },
  );
  vi.stubGlobal('fetch', async (path: string, options: RequestInit) => {
    if (path === '/api/me/context') {
      contextRequests++;
      if (waiting)
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return signedIn
        ? Response.json({
            user: { id: 'recipient', name: 'Rina' },
            hasMemberships: false,
            currentStore: null,
            contextTag: 'verified',
          })
        : anonymous();
    }
    if (path === '/api/auth/google')
      return Response.json(
        { status: 'signup_required', signupTicket: 'b'.repeat(43) },
        { status: 202 },
      );
    if (path.endsWith('/code/verify'))
      return Response.json(
        { status: 'totp_required', challengeId: 'c'.repeat(43) },
        { status: 202 },
      );
    if (path === '/api/invites/accept') {
      accepted.push(JSON.parse(String(options.body)));
      return Response.json(
        { storeId: 'shop', membershipId: 'member' },
        { headers: { 'x-session-context': 'verified' } },
      );
    }
    if (path === '/api/auth/totp' || path === '/api/auth/password') signedIn = true;
    return new Response(null, { status: 204 });
  });
  return {
    accepted,
    anonymous,
    count: () => contextRequests,
    pause: () => {
      waiting = true;
    },
    resume: (response: Response) => {
      waiting = false;
      release(response);
    },
  };
}
it.each(['signup', 'phone', 'email'])(
  'retains invited %s code and TOTP across real focus/reconnect checks',
  async (view) => {
    const network = transport();
    show(view);
    const user = userEvent.setup();
    if (view === 'signup') {
      await user.type(await screen.findByLabelText('Full name'), 'Rina');
      await user.type(screen.getByLabelText('Mobile number'), '01712345678');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.click(screen.getByLabelText('I agree to the Terms and Privacy documents.'));
      await user.click(screen.getByRole('button', { name: 'Send verification code' }));
    } else {
      await user.type(
        await screen.findByLabelText(view === 'phone' ? 'Mobile number' : 'Email'),
        view === 'phone' ? '01712345678' : 'rina@example.test',
      );
      await user.click(screen.getByRole('button', { name: 'Get a code' }));
    }
    const label = view === 'signup' ? 'Verification code' : 'Sign-in code';
    const code = await screen.findByLabelText<HTMLInputElement>(label);
    await user.type(code, '123456');
    network.pause();
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    });
    await waitFor(() => expect(network.count()).toBe(2));
    expect(screen.getByLabelText(label)).toBe(code);
    expect(code.value).toBe('123456');
    expect(code.matches(':disabled')).toBe(true);
    await act(async () => network.resume(network.anonymous()));
    await waitFor(() => expect(code.matches(':disabled')).toBe(false));
    expect(screen.getByLabelText(label)).toBe(code);
    await user.click(
      screen.getByRole('button', { name: view === 'signup' ? 'Verify mobile' : 'Verify code' }),
    );
    const totp = await screen.findByLabelText<HTMLInputElement>('Authenticator or backup code');
    await user.type(totp, '654321');
    network.pause();
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(network.count()).toBe(3));
    expect(screen.getByLabelText('Authenticator or backup code')).toBe(totp);
    expect(totp.value).toBe('654321');
    await act(async () =>
      network.resume(
        Response.json({ error: { code: 'UNAVAILABLE', message: 'Unavailable' } }, { status: 503 }),
      ),
    );
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(totp.matches(':disabled')).toBe(true);
    await user.click(retry);
    await waitFor(() => expect(totp.matches(':disabled')).toBe(false));
    expect(screen.getByLabelText('Authenticator or backup code')).toBe(totp);
    expect(totp.value).toBe('654321');
    await user.click(screen.getByRole('button', { name: 'Finish sign-in' }));
    await screen.findByRole('button', { name: 'Accept invitation' });
    expect(network.accepted).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await screen.findByText('Invitation accepted.');
    expect(network.accepted).toEqual([{ token: 'a'.repeat(64) }]);
    expect(location.hash).toBe('');
    expect(localStorage.length + sessionStorage.length).toBe(0);
  },
);
it('returns from Google signup to visible phone sign-in and retains explicit invitation acceptance', async () => {
  const network = transport();
  Object.defineProperty(window, 'google', {
    configurable: true,
    value: {
      accounts: {
        id: {
          initialize({ callback }: { callback: (response: { credential: string }) => void }) {
            this.deliver = () => callback({ credential: 'provider-credential' });
          },
          deliver() {},
          renderButton(element: HTMLElement) {
            const button = document.createElement('button');
            button.textContent = 'Continue with Google';
            button.onclick = () => this.deliver();
            element.replaceChildren(button);
          },
        },
      },
    },
  });
  show('phone');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Continue with Google' }));
  await screen.findByLabelText('Full name');
  await user.click(screen.getByRole('link', { name: 'Already have an account? Sign in' }));
  await screen.findByRole('heading', { name: 'Sign in' });
  expect(screen.queryByLabelText('Full name')).toBeNull();
  await user.type(screen.getByLabelText('Mobile number'), '01712345678');
  await user.type(screen.getByLabelText('Password'), 'password123');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('button', { name: 'Accept invitation' });
  expect(network.accepted).toEqual([]);
  await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
  await screen.findByText('Invitation accepted.');
  expect(network.accepted).toEqual([{ token: 'a'.repeat(64) }]);
});
