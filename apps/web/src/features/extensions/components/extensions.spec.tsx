// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { ToastProvider } from '@dakly/ui/toast';

import { ExtensionsScreen } from './extensions-screen';
import { sessionContextKey } from '@/lib/session-context';

function show(extensions: string[], canChangeExtensions = true) {
  const writes: unknown[] = [];
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      postMessage() {}
      close() {}
    },
  );
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    if (init.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as { extensions: string[] };
      writes.push(body);
      extensions = body.extensions;
    }
    return Response.json(
      { id: 'shop', extensions },
      { headers: { 'x-session-context': 'verified' } },
    );
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    contextTag: 'verified',
    currentStore: { canViewStoreSettings: true, canChangeExtensions },
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ExtensionsScreen />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return writes;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows the count, the four cards and locks Physical Shop', async () => {
  show(['sales', 'chats']);
  expect(await screen.findByText('2 of 4 on')).toBeTruthy();
  expect(screen.getByRole('switch', { name: 'Sales' }).getAttribute('aria-checked')).toBe('true');
  expect(
    screen.getByRole('switch', { name: 'Social Auto Post' }).getAttribute('aria-checked'),
  ).toBe('false');
  expect(screen.getByRole('switch', { name: 'Physical Shop' }).matches(':disabled')).toBe(true);
  expect(screen.getByText('Coming soon')).toBeTruthy();
});

it('turns one extension off and keeps the others', async () => {
  const writes = show(['sales', 'chats']);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('switch', { name: 'Chats' }));
  await waitFor(() => expect(writes).toEqual([{ extensions: ['sales'] }]));
  await screen.findByText('1 of 4 on');
  const card = screen.getByRole('group', { name: 'Chats' });
  expect(within(card).getByText('Off')).toBeTruthy();
});

it('does not let a member without the extension permission change anything', async () => {
  show(['sales'], false);
  expect((await screen.findByRole('switch', { name: 'Sales' })).matches(':disabled')).toBe(true);
  expect(screen.getByText('Only the Owner or an Admin can change extensions.')).toBeTruthy();
});
