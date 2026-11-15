// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { SessionContext } from '@dakly/contracts/sessions';
import { StoreSwitcher } from './store-switcher';

const stores = [
  { storeId: '11111111-1111-4111-8111-111111111111', name: 'Dhaka Threads' },
  { storeId: '22222222-2222-4222-8222-222222222222', name: 'Sylhet Books' },
];
const session: SessionContext = {
  user: { id: '33333333-3333-4333-8333-333333333333', name: 'রিনা' },
  stores,
  currentStore: null,
  contextTag: 'verified-context',
};
afterEach(cleanup);

describe('StoreSwitcher', () => {
  it('lets a person choose a labelled shop and waits for the verified selection', async () => {
    const user = userEvent.setup();
    let requested = '';
    const onSwitch = async (id: string) => {
      requested = id;
    };
    const { rerender } = render(<StoreSwitcher session={session} onSwitch={onSwitch} />);
    const chooser = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Current shop' });
    await user.selectOptions(chooser, screen.getByRole('option', { name: 'Sylhet Books' }));
    expect(requested).toBe(stores[1]!.storeId);
    expect(chooser.value).toBe('');
    rerender(
      <StoreSwitcher
        session={{
          ...session,
          currentStore: {
            ...stores[1]!,
            canViewCustomers: true,
            canCreateCustomer: true,
            canApproveSupport: false,
            canViewTeam: false,
            canEditTeam: false,
            canTransferOwnership: false,
            canViewStoreSettings: false,
            canEditStoreSettings: false,
            canChangeExtensions: false,
          },
        }}
        onSwitch={onSwitch}
      />,
    );
    expect(chooser.value).toBe(stores[1]!.storeId);
  });

  it('shows an empty membership state without an unusable chooser', () => {
    render(<StoreSwitcher session={{ ...session, stores: [] }} onSwitch={async () => {}} />);
    expect(screen.getByText('No shop yet')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
