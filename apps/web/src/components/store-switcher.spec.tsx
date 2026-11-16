// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionContext } from '@dakly/contracts/sessions';

import { StoreSwitcher } from './store-switcher';

const stores = [
  { storeId: '11111111-1111-4111-8111-111111111111', name: 'Dhaka Threads' },
  { storeId: '22222222-2222-4222-8222-222222222222', name: 'Dhaka Threads Sylhet' },
];
const selected = {
  ...stores[1]!,
  canViewCustomers: true,
  canCreateCustomer: true,
  canViewSegments: true,
  canEditSegments: true,
  canApproveSupport: false,
  canViewTeam: false,
  canEditTeam: false,
  canTransferOwnership: false,
  canViewStoreSettings: false,
  canEditStoreSettings: false,
  canChangeExtensions: false,
};
const session: SessionContext = {
  user: { id: '33333333-3333-4333-8333-333333333333', name: 'রিনা' },
  hasMemberships: true,
  currentStore: selected,
  contextTag: 'verified-context',
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function renderPicker(value = session, onSwitch = async (_id: string) => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StoreSwitcher session={value} onSwitch={onSwitch} />
    </QueryClientProvider>,
  );
}
describe('StoreSwitcher', () => {
  it('preserves an off-page selection and loads additional options only on request', async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        requests.push(url);
        return new Response(
          JSON.stringify({
            items: url.includes('after=') ? [stores[1]] : [stores[0]],
            nextCursor: url.includes('after=') ? null : stores[0]!.storeId,
          }),
          { headers: { 'x-session-context': session.contextTag } },
        );
      }),
    );
    let requested = '';
    renderPicker(session, async (id) => {
      requested = id;
    });
    await screen.findByRole('option', { name: 'Dhaka Threads' });
    const chooser = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Current shop' });
    expect(chooser.value).toBe(stores[1]!.storeId);
    expect(requests).toHaveLength(1);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Load more shops' }));
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(screen.getAllByRole('option', { name: 'Dhaka Threads Sylhet' })).toHaveLength(1);
    await user.selectOptions(chooser, stores[0]!.storeId);
    expect(requested).toBe(stores[0]!.storeId);
    expect(chooser.value).toBe(stores[1]!.storeId);
  });
  it('shows an empty membership state without making a list request', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    renderPicker({ ...session, hasMemberships: false, currentStore: null });
    expect(screen.getByText('No shop yet')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
