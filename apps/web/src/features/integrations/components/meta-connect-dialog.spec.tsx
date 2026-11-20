// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MetaConnectDialog } from './meta-connect-dialog';
import { sessionContextKey } from '@/lib/session-context';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('closes the Facebook window when the shop leaves the waiting dialog', async () => {
  const facebook = { closed: false, close: vi.fn(), location: { href: '' } };
  vi.stubGlobal('open', () => facebook);
  vi.stubGlobal('fetch', async () =>
    Response.json(
      { authorizationUrl: 'https://facebook.test/login' },
      { headers: { 'x-session-context': 'verified' } },
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { canEditStoreSettings: true },
  });
  const onClose = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <MetaConnectDialog
        kind="facebook_page"
        connections={[]}
        onClose={onClose}
        onConnected={vi.fn()}
      />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Continue with Facebook' }));
  await screen.findByText('Finish in the Facebook window, then come back here.');
  expect(facebook.location.href).toBe('https://facebook.test/login');
  expect(facebook.close).not.toHaveBeenCalled();
  view.unmount();
  expect(facebook.close).toHaveBeenCalledOnce();
});

it('shows the Continue with Facebook button in the Facebook colour', () => {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MetaConnectDialog
        kind="instagram"
        connections={[]}
        onClose={vi.fn()}
        onConnected={vi.fn()}
      />
    </QueryClientProvider>,
  );
  const button = screen.getByRole('button', { name: 'Continue with Facebook' });
  expect(button.className).toContain('bg-facebook');
  expect(button.className).not.toContain('bg-action');
});
