// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ContactDetailResponse,
  ContactListQuery,
  ContactResponse,
} from '@dakly/contracts/contacts';
import type { SessionContext } from '@dakly/contracts/sessions';

import { CustomerProfile } from './customer-profile';
import { CustomersScreen } from './customers-screen';
import { sessionContextKey } from '@/lib/session-context';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const contactId = '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e5f';
const rahima: ContactResponse = {
  id: contactId,
  name: 'Rahima Akter',
  phone: '01712-XXX678',
  kind: 'customer',
  tags: ['wholesale'],
  createdAt: '2026-11-10T08:00:00Z',
};
const allCustomers: ContactListQuery = { limit: 50 };

type Reply = { status?: number; body?: unknown };
type Sent = { path: string; method: string; body: unknown };
let sent: Sent[] = [];

function respond(reply: (path: string, method: string) => Reply | Promise<never>) {
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    const method = init.method ?? 'GET';
    sent.push({ path, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const { status = 200, body } = await reply(path, method);
    return status === 204
      ? new Response(null, { status, headers: { 'x-session-context': 'verified' } })
      : Response.json(body, { status, headers: { 'x-session-context': 'verified' } });
  });
}

const apiError = (status: number, code: string, message: string) => ({
  status,
  body: { error: { code, message } },
});

function show(child: ReactNode, canEdit = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const context: SessionContext = {
    user: { id: 'member', name: 'Member' },
    currentStore: {
      storeId: 'shop',
      name: 'Shop',
      canViewCustomers: true,
      canCreateCustomer: canEdit,
      canViewSegments: true,
      canViewTeam: false,
      canEditTeam: false,
      canApproveSupport: false,
      canTransferOwnership: false,
      canViewStoreSettings: false,
      canEditStoreSettings: false,
      canChangeExtensions: false,
    },
    contextTag: 'verified',
    hasMemberships: true,
  };
  client.setQueryData(sessionContextKey, context);
  return render(child, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  sent = [];
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
});

describe('All customers', () => {
  it('shows a skeleton while the list loads', async () => {
    respond(() => new Promise<never>(() => undefined));
    show(<CustomersScreen query={allCustomers} />);
    expect(await screen.findByText('Loading customers')).toBeTruthy();
  });

  it('says the store has no customers yet', async () => {
    respond(() => ({ body: { items: [], nextCursor: null } }));
    show(<CustomersScreen query={allCustomers} />);
    expect(await screen.findByText('No customers yet. Customers you add show here.')).toBeTruthy();
  });

  it('offers a retry when the list fails', async () => {
    respond(() => apiError(503, 'UNAVAILABLE', 'Customers are not available right now'));
    show(<CustomersScreen query={allCustomers} />);
    expect(await screen.findByText('Customers are not available right now')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry customers' })).toBeTruthy();
  });

  it('shows the phone as the API sent it and links to the next page', async () => {
    respond(() => ({
      body: {
        items: [rahima, { ...rahima, id: 'other', name: 'Karim Mia', phone: '01812345678' }],
        nextCursor: contactId,
      },
    }));
    show(<CustomersScreen query={{ ...allCustomers, kind: 'customer' }} />);
    const table = within(await screen.findByRole('table'));
    expect(table.getByText('01712-XXX678')).toBeTruthy();
    expect(table.getByText('01812-345678')).toBeTruthy();
    expect(table.getByRole('link', { name: 'Rahima Akter' }).getAttribute('href')).toBe(
      `/customers/${contactId}`,
    );
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe(
      `/customers?kind=customer&cursor=${contactId}`,
    );
    expect(sent[0]?.path).toBe('/api/contacts?limit=50&kind=customer');
  });

  it('shows a short name search as an error on the search field', async () => {
    respond(() =>
      apiError(400, 'CONTACT_SEARCH_TOO_SHORT', 'Type at least 3 letters to search by name'),
    );
    show(<CustomersScreen query={{ ...allCustomers, search: 'ra' }} />);
    const search = await screen.findByRole('searchbox', { name: 'Search' });
    await waitFor(() => expect(search.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByRole('alert').textContent).toBe('Type at least 3 letters to search by name');
    expect(screen.queryByRole('button', { name: 'Retry customers' })).toBeNull();
  });

  it('puts the search and tag in the address and starts from the first page', async () => {
    respond(() => ({ body: { items: [], nextCursor: null } }));
    show(<CustomersScreen query={{ ...allCustomers, kind: 'lead', cursor: contactId }} />);
    const user = userEvent.setup();
    await user.type(await screen.findByRole('searchbox', { name: 'Search' }), '01712345678');
    await user.type(screen.getByLabelText('Tag'), ' eid ');
    await user.click(screen.getByRole('button', { name: 'Search customers' }));
    expect(push).toHaveBeenCalledWith('/customers?kind=lead&search=01712345678&tag=eid');
  });

  it('shows a taken phone on the add form phone field', async () => {
    respond((_path, method) =>
      method === 'POST'
        ? apiError(409, 'CONTACT_PHONE_TAKEN', 'A contact with this phone number already exists')
        : { body: { items: [], nextCursor: null } },
    );
    show(<CustomersScreen query={allCustomers} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), 'Rahima Akter');
    await user.type(screen.getByLabelText('Phone'), '01712345678');
    await user.click(screen.getByRole('button', { name: 'Add customer' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Phone').getAttribute('aria-invalid')).toBe('true'),
    );
    expect(screen.getByText('A contact with this phone number already exists')).toBeTruthy();
  });
});

describe('Customer profile', () => {
  const detail: ContactDetailResponse = {
    ...rahima,
    identities: [
      {
        id: 'identity',
        channel: 'messenger',
        channelConnectionId: 'page',
        profileName: 'Rahima A',
      },
    ],
  };

  it('shows the masked phone and the channel identities without edit controls for viewers', async () => {
    respond(() => ({ body: detail }));
    show(<CustomerProfile contactId={contactId} />, false);
    expect(await screen.findByRole('heading', { name: 'Rahima Akter' })).toBeTruthy();
    expect(screen.getByText('01712-XXX678')).toBeTruthy();
    expect(screen.getByText('Messenger: Rahima A')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit customer' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Marketing permission' })).toBeNull();
  });

  it('says when the customer is gone', async () => {
    respond(() => apiError(404, 'CONTACT_NOT_FOUND', 'Contact not found'));
    show(<CustomerProfile contactId={contactId} />);
    expect(
      await screen.findByText('This customer was deleted or is not in this shop.'),
    ).toBeTruthy();
  });

  it('sends a typed phone and the tags, and shows a taken phone on its field', async () => {
    respond((_path, method) =>
      method === 'PATCH'
        ? apiError(409, 'CONTACT_PHONE_TAKEN', 'A contact with this phone number already exists')
        : { body: detail },
    );
    show(<CustomerProfile contactId={contactId} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit customer' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Edit Rahima Akter' }));
    expect(dialog.getByText('Leave empty to keep 01712-XXX678')).toBeTruthy();
    const tags = dialog.getByLabelText('Tags');
    await user.clear(tags);
    await user.type(tags, 'wholesale, eid');
    await user.type(dialog.getByLabelText('New mobile number'), '+880 1812-345678');
    await user.click(dialog.getByRole('button', { name: 'Save customer' }));
    await waitFor(() =>
      expect(dialog.getByLabelText('New mobile number').getAttribute('aria-invalid')).toBe('true'),
    );
    expect(sent.find((request) => request.method === 'PATCH')?.body).toEqual({
      name: 'Rahima Akter',
      phone: '01812345678',
      tags: ['wholesale', 'eid'],
    });
  });

  it('keeps the phone out of the change when it is left empty', async () => {
    respond(() => ({ body: detail }));
    show(<CustomerProfile contactId={contactId} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit customer' }));
    await user.click(screen.getByRole('button', { name: 'Save customer' }));
    await waitFor(() =>
      expect(sent.find((request) => request.method === 'PATCH')?.body).toEqual({
        name: 'Rahima Akter',
        tags: ['wholesale'],
      }),
    );
  });

  it('names the customer before deleting and returns to the list', async () => {
    respond((_path, method) => (method === 'DELETE' ? { status: 204 } : { body: detail }));
    show(<CustomerProfile contactId={contactId} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Delete customer' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Delete Rahima Akter?' }));
    await user.click(dialog.getByRole('button', { name: 'Delete customer' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/customers'));
    expect(sent.at(-2)).toMatchObject({ path: `/api/contacts/${contactId}`, method: 'DELETE' });
  });

  it('offers only a withdrawal on Messenger and asks how the customer answered', async () => {
    respond(() => ({ body: detail }));
    show(<CustomerProfile contactId={contactId} />);
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Channel'), 'messenger');
    const agreed = screen.getByRole('option', { name: 'Agreed to marketing messages' });
    expect((agreed as HTMLOptionElement).disabled).toBe(true);
    await user.selectOptions(screen.getByLabelText('Answer'), 'withdrawn');
    await user.click(screen.getByRole('button', { name: 'Save answer' }));
    expect(
      await screen.findByText('Write how the customer told you, up to 500 characters.'),
    ).toBeTruthy();
    expect(sent.some((request) => request.method === 'POST')).toBe(false);
  });

  it('records a WhatsApp opt-in with the note', async () => {
    respond((_path, method) =>
      method === 'POST'
        ? {
            body: {
              id: 'consent',
              contactId,
              channel: 'whatsapp',
              status: 'granted',
              source: 'manual',
              capturedAt: '2026-11-16T08:00:00Z',
            },
          }
        : { body: detail },
    );
    show(<CustomerProfile contactId={contactId} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('How they told you'), 'Said yes on a call');
    await user.click(screen.getByRole('button', { name: 'Save answer' }));
    expect(await screen.findByText('Answer saved')).toBeTruthy();
    expect(sent.find((request) => request.method === 'POST')).toMatchObject({
      path: `/api/contacts/${contactId}/consents`,
      body: { channel: 'whatsapp', status: 'granted', note: 'Said yes on a call' },
    });
  });
});
