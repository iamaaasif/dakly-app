// @vitest-environment jsdom
import { readFileSync } from 'node:fs';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ContactDetailResponse,
  ContactListItemResponse,
  ContactListQuery,
  ContactResponse,
} from '@dakly/contracts/contacts';
import type { SessionContext } from '@dakly/contracts/sessions';
import { ToastProvider } from '@dakly/ui/toast';

import { defaultCustomerColumns } from '../customer-columns';
import { CustomerProfile } from './customer-profile';
import { CustomersScreen } from './customers-screen';
import { ImportResultStep } from './import-result-step';
import { sessionContextKey } from '@/lib/session-context';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/use-url-query', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUrlRouter: () => ({ push: push, replace: replace }),
}));

const contactId = '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e5f';
const rahima: ContactResponse = {
  id: contactId,
  name: 'Rahima Akter',
  phone: '01712-XXX678',
  kind: 'customer',
  tags: ['wholesale'],
  createdAt: '2026-11-10T08:00:00Z',
};
const rahimaInList: ContactListItemResponse = {
  ...rahima,
  whatsappPhone: '01712-XXX999',
  email: 'rahima@example.com',
  district: 'Sylhet',
  source: 'messenger',
  consentedChannels: ['whatsapp', 'sms'],
};
const allCustomers: ContactListQuery = { limit: 50 };

type Reply = { status?: number; body?: unknown };
type Sent = { path: string; method: string; body: unknown };
let sent: Sent[] = [];

function respond(reply: (path: string, method: string) => Reply | Promise<never>) {
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    const method = init.method ?? 'GET';
    sent.push({
      path,
      method,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    });
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

function show(child: ReactNode, canEdit = true, canExport = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const context: SessionContext = {
    user: { id: 'member', name: 'Member' },
    currentStore: {
      storeId: 'shop',
      name: 'Shop',
      canViewProducts: false,
      canEditProducts: false,
      canViewOrders: false,
      canEditOrders: false,
      canExportOrders: false,
      canViewDueBook: false,
      canEditDueBook: false,
      canViewCampaigns: false,
      canViewAnalytics: false,
      canChangeAttributionWindow: false,
      canEditCampaigns: false,
      canViewSocial: false,
      canEditSocial: false,
      canViewAutomations: false,
      canEditAutomations: false,
      canViewCustomers: true,
      canCreateCustomer: canEdit,
      canExportCustomers: canExport,
      canViewChats: true,
      canEditChats: true,
      canViewSegments: true,
      canEditSegments: true,
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
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
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
  replace.mockReset();
});

describe('All customers', () => {
  it('shows a skeleton while the list loads', async () => {
    respond(() => new Promise<never>(() => undefined));
    show(<CustomersScreen query={allCustomers} columns={defaultCustomerColumns} />);
    expect(await screen.findByText('Loading customers')).toBeTruthy();
  });

  it('says the store has no customers yet', async () => {
    respond(() => ({ body: { items: [], nextCursor: null } }));
    show(<CustomersScreen query={allCustomers} columns={defaultCustomerColumns} />);
    expect(await screen.findByText('No customers yet. Customers you add show here.')).toBeTruthy();
  });

  it('offers a retry when the list fails', async () => {
    respond(() => apiError(503, 'UNAVAILABLE', 'Customers are not available right now'));
    show(<CustomersScreen query={allCustomers} columns={defaultCustomerColumns} />);
    expect(await screen.findByText('Customers are not available right now')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry customers' })).toBeTruthy();
  });

  it('shows the phone as the API sent it and links to the next page', async () => {
    respond(() => ({
      body: {
        items: [
          rahimaInList,
          { ...rahimaInList, id: 'other', name: 'Karim Mia', phone: '01812345678' },
        ],
        nextCursor: contactId,
      },
    }));
    show(
      <CustomersScreen
        query={{ ...allCustomers, kind: 'customer' }}
        columns={defaultCustomerColumns}
      />,
    );
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

  it('shows the columns the address names and no others', async () => {
    respond(() => ({ body: { items: [rahimaInList], nextCursor: null } }));
    show(
      <CustomersScreen
        query={allCustomers}
        columns={['email', 'location', 'source', 'tags', 'consent']}
      />,
    );
    const table = within(await screen.findByRole('table'));
    expect(table.getByText('rahima@example.com')).toBeTruthy();
    expect(table.getByText('Sylhet')).toBeTruthy();
    expect(table.getByText('Messenger')).toBeTruthy();
    expect(table.getByText('wholesale')).toBeTruthy();
    expect(table.getByText('SMS')).toBeTruthy();
    expect(table.queryByRole('columnheader', { name: 'Phone' })).toBeNull();
    expect(table.queryByText('01712-XXX678')).toBeNull();
  });

  it('shows a quiet note where a column has no value', async () => {
    respond(() => ({
      body: {
        items: [
          {
            ...rahimaInList,
            tags: [],
            whatsappPhone: null,
            phone: null,
            email: null,
            district: null,
            consentedChannels: [],
          },
        ],
        nextCursor: null,
      },
    }));
    show(
      <CustomersScreen
        query={allCustomers}
        columns={['whatsapp', 'email', 'location', 'tags', 'consent']}
      />,
    );
    const table = within(await screen.findByRole('table'));
    expect(table.getByText('No number')).toBeTruthy();
    expect(table.getByText('No email')).toBeTruthy();
    expect(table.getByText('No location')).toBeTruthy();
    expect(table.getByText('No tags')).toBeTruthy();
    expect(table.getByText('None')).toBeTruthy();
  });

  it('puts a column choice in the address and keeps the filters', async () => {
    respond(() => ({ body: { items: [rahimaInList], nextCursor: null } }));
    show(
      <CustomersScreen
        query={{ ...allCustomers, kind: 'customer' }}
        columns={defaultCustomerColumns}
      />,
    );
    await screen.findByRole('table');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Email' }));
    expect(replace).toHaveBeenCalledWith(
      '/customers?kind=customer&columns=phone%2Cwhatsapp%2Cemail',
    );
    // The screen is not re-rendered by the mocked router, so this starts from the defaults again.
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'WhatsApp' }));
    expect(replace).toHaveBeenLastCalledWith('/customers?kind=customer&columns=phone');
  });

  it('shows a short name search as an error on the search field', async () => {
    respond(() =>
      apiError(400, 'CONTACT_SEARCH_TOO_SHORT', 'Type at least 3 letters to search by name'),
    );
    show(
      <CustomersScreen
        query={{ ...allCustomers, search: 'ra' }}
        columns={defaultCustomerColumns}
      />,
    );
    const search = await screen.findByRole('searchbox', { name: 'Search' });
    await waitFor(() => expect(search.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByRole('alert').textContent).toBe('Type at least 3 letters to search by name');
    expect(screen.queryByRole('button', { name: 'Retry customers' })).toBeNull();
  });

  it('puts the search and tag in the address and starts from the first page', async () => {
    respond(() => ({ body: { items: [], nextCursor: null } }));
    show(
      <CustomersScreen
        query={{ ...allCustomers, kind: 'lead', cursor: contactId }}
        columns={defaultCustomerColumns}
      />,
    );
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
    show(<CustomersScreen query={allCustomers} columns={defaultCustomerColumns} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add customers' }));
    await user.click(screen.getByRole('button', { name: /Add manually/ }));
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

  describe('possible same person', () => {
    const suggestion = {
      id: 'suggestion',
      reason: 'same_phone',
      otherContact: { id: 'other', name: 'Karim Uddin', phone: '01712-XXX678' },
      createdAt: '2026-11-18T08:00:00Z',
    };
    const serve = (suggestions: unknown[]) =>
      respond((path, method) => {
        if (path.includes('/dismiss')) return { status: 204 };
        if (path.includes('/contact-match-suggestions') && method === 'GET')
          return { body: suggestions };
        return { body: detail };
      });

    it('lists the other contact with the phone as the API sent it, and links to them', async () => {
      serve([suggestion]);
      show(<CustomerProfile contactId={contactId} />);
      expect(await screen.findByRole('heading', { name: 'Possible same person' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Karim Uddin' }).getAttribute('href')).toBe(
        '/customers/other',
      );
      expect(screen.getByText(/01712-XXX678 · has the same phone number/)).toBeTruthy();
      expect(sent.some((call) => call.path.endsWith(`contactId=${contactId}`))).toBe(true);
    });

    it('dismisses a match and then hides the note', async () => {
      let open = [suggestion];
      respond((path, method) => {
        if (path.includes('/dismiss')) {
          open = [];
          return { status: 204 };
        }
        if (path.includes('/contact-match-suggestions') && method === 'GET') return { body: open };
        return { body: detail };
      });
      show(<CustomerProfile contactId={contactId} />);
      await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
      await waitFor(() =>
        expect(screen.queryByRole('heading', { name: 'Possible same person' })).toBeNull(),
      );
      expect(sent.map((call) => call.path)).toContain(
        '/api/contact-match-suggestions/suggestion/dismiss',
      );
    });

    it('offers no Dismiss to a viewer, and shows nothing when there are no matches', async () => {
      serve([suggestion]);
      show(<CustomerProfile contactId={contactId} />, false);
      expect(await screen.findByRole('heading', { name: 'Possible same person' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
      cleanup();
      serve([]);
      show(<CustomerProfile contactId={contactId} />);
      await screen.findByRole('heading', { name: 'Rahima Akter' });
      expect(screen.queryByRole('heading', { name: 'Possible same person' })).toBeNull();
    });
  });

  describe('merging', () => {
    const suggestion = {
      id: 'suggestion',
      reason: 'same_phone',
      otherContact: { id: 'other', name: 'Karim Uddin', phone: '01712-XXX678' },
      createdAt: '2026-11-18T08:00:00Z',
    };
    const merge = {
      id: 'merge-1',
      keptContactId: 'other',
      mergedContactId: contactId,
      mergedContactName: 'Rahima Akter',
      mergedAt: '2026-11-20T08:00:00Z',
      undoUntil: '2026-11-27T08:00:00Z',
      undoneAt: null,
      undoConflicts: [],
    };

    it('asks first, merges with one key, and opens the kept profile', async () => {
      respond((path, method) => {
        if (path === '/api/contact-merges' && method === 'POST') return { body: merge };
        if (path.includes('/contact-match-suggestions')) return { body: [suggestion] };
        if (path.includes('/contact-merges')) return { body: [] };
        return { body: detail };
      });
      show(<CustomerProfile contactId={contactId} />);
      await userEvent.click(await screen.findByRole('button', { name: 'Merge' }));
      expect(screen.getByRole('dialog', { name: 'Merge Karim Uddin?' })).toBeTruthy();
      expect(screen.getByText('You can undo the merge for 7 days.')).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Merge customers' }));
      await waitFor(() => expect(push).toHaveBeenCalledWith('/customers/other'));
      const posted = sent.find((call) => call.method === 'POST');
      expect(posted?.body).toEqual({
        contactId,
        otherContactId: 'other',
        operationKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      });
    });

    it('shows the API reason when a merge is refused', async () => {
      respond((path, method) => {
        if (path === '/api/contact-merges' && method === 'POST')
          return apiError(
            409,
            'CONTACT_MERGE_CHAT_CONFLICT',
            'Both customers have a chat on the same page.',
          );
        if (path.includes('/contact-match-suggestions')) return { body: [suggestion] };
        if (path.includes('/contact-merges')) return { body: [] };
        return { body: detail };
      });
      show(<CustomerProfile contactId={contactId} />);
      await userEvent.click(await screen.findByRole('button', { name: 'Merge' }));
      await userEvent.click(screen.getByRole('button', { name: 'Merge customers' }));
      expect((await screen.findByRole('alert')).textContent).toContain('same page');
    });

    it('lists a merge that can be undone and returns to the restored profile', async () => {
      respond((path, method) => {
        if (path.endsWith('/undo')) return { body: { ...merge, undoneAt: '2026-11-21T08:00:00Z' } };
        if (path.includes('/contact-match-suggestions')) return { body: [] };
        if (path.includes('/contact-merges') && method === 'GET') return { body: [merge] };
        return { body: detail };
      });
      show(<CustomerProfile contactId={contactId} />);
      expect(await screen.findByText('Merged with Rahima Akter')).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Undo merge' }));
      await waitFor(() => expect(push).toHaveBeenCalledWith(`/customers/${contactId}`));
      expect(await screen.findByText('Merge undone.')).toBeTruthy();
    });

    it('offers no Merge or Undo to a viewer', async () => {
      respond((path) => {
        if (path.includes('/contact-match-suggestions')) return { body: [suggestion] };
        if (path.includes('/contact-merges')) return { body: [merge] };
        return { body: detail };
      });
      show(<CustomerProfile contactId={contactId} />, false);
      await screen.findByText('Merged with Rahima Akter');
      expect(screen.queryByRole('button', { name: 'Merge' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Undo merge' })).toBeNull();
    });
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

describe('Import customers', () => {
  // jsdom files cannot be read as bytes yet; browsers can.
  beforeEach(() => {
    File.prototype.arrayBuffer = function (this: File) {
      return new Promise<ArrayBuffer>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(this);
      });
    };
  });
  const importId = '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e60';
  const file = new File(
    ['Customer Name,Mobile Number\r\nRahima Akter,01712345678\r\n"Karim, Uddin",01812345678\r\n'],
    'customers.csv',
    { type: 'text/csv' },
  );
  const done = (status: string, extra = {}) => ({
    id: importId,
    status,
    undoFinishedAt: null,
    rowsTotal: 2,
    rowsAdded: 1,
    rowsUpdated: 0,
    rowsSkipped: 0,
    rowsFailed: 1,
    reportUrl: 'https://files.example.test/report.csv',
    ...extra,
  });

  it('uploads the file, maps the columns and starts the import with the shop evidence', async () => {
    respond((path) => {
      if (path === '/api/imports')
        return { body: { importId, uploadUrl: 'https://files.example.test/up' } };
      if (path.startsWith('https://files')) return { status: 200, body: {} };
      if (path.endsWith('/start')) return { status: 202, body: done('importing') };
      if (path === `/api/imports/${importId}`) return { body: done('done') };
      return { body: { items: [], nextCursor: null } };
    });
    show(<CustomersScreen query={allCustomers} columns={defaultCustomerColumns} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add customers' }));
    await user.click(screen.getByRole('button', { name: /Import from an Excel or CSV/ }));
    await user.upload(screen.getByLabelText('Customer file'), file);
    expect((await screen.findByRole('status')).textContent).toContain('2 rows · 2 columns');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Step 2 of 7 · Detect')).toBeTruthy();
    expect(screen.getByText('Rows').nextSibling?.textContent).toBe('2');
    expect(screen.getByText('Columns', { selector: 'dt' }).nextSibling?.textContent).toBe('2');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(((await screen.findByLabelText('Phone')) as HTMLSelectElement).value).toBe('1');
    expect((screen.getByLabelText(/Name/) as HTMLSelectElement).value).toBe('0');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Karim, Uddin')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('radio', { name: /Leave existing customers/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByLabelText(/WhatsApp: where/), 'Shopify checkout');
    await user.click(screen.getByRole('button', { name: 'Import 2 customers' }));

    expect(await screen.findByText('Import finished.')).toBeTruthy();
    expect(sent.find((request) => request.path.endsWith('/start'))?.body).toEqual({
      mapping: { phone: 1, name: 0 },
      duplicateMode: 'skip',
      consentEvidence: { whatsapp: 'Shopify checkout' },
    });
    expect(screen.getByRole('link', { name: 'Download the error report' })).toBeTruthy();
  });

  it('asks for the phone column before going on', async () => {
    respond((path) =>
      path === '/api/imports'
        ? { body: { importId, uploadUrl: 'https://files.example.test/up' } }
        : { body: { items: [], nextCursor: null } },
    );
    show(<CustomersScreen query={allCustomers} columns={defaultCustomerColumns} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add customers' }));
    await user.click(screen.getByRole('button', { name: /Import from an Excel or CSV/ }));
    await user.upload(
      screen.getByLabelText('Customer file'),
      new File(['Who,Number\r\nRahima,01712345678\r\n'], 'list.csv', { type: 'text/csv' }),
    );
    await screen.findByRole('status');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Choose the column that has phone numbers')).toBeTruthy();
    expect(screen.queryByText('Step 4 of 7 · Preview')).toBeNull();
  });

  it.each([
    ['2486', '2,486 customers'],
    ['1', '1 customer'],
  ])('exports the customers on the screen and says how many (%s)', async (rows, said) => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (path: string) => {
      urls.push(path);
      const headers = {
        'x-session-context': 'verified',
        'content-disposition': 'attachment; filename="dakly-customers-2026-11-20.xlsx"',
        'x-row-count': rows,
      };
      return path.startsWith('/api/contacts/export')
        ? new Response('file', { headers })
        : Response.json({ items: [], nextCursor: null }, { headers });
    });
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }),
    );
    show(
      <CustomersScreen
        query={{ limit: 50, kind: 'lead', tag: 'eid' }}
        columns={defaultCustomerColumns}
      />,
      true,
      true,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Export' }));
    expect(
      await screen.findByText(`Exporting ${said} to Excel. Check your downloads in a moment.`),
    ).toBeTruthy();
    expect(urls.some((url) => url === '/api/contacts/export?kind=lead&tag=eid')).toBe(true);
  });

  it('offers no Export button without the Download customer lists switch', async () => {
    respond(() => ({ body: { items: [], nextCursor: null } }));
    show(<CustomersScreen query={allCustomers} columns={defaultCustomerColumns} />);
    await screen.findByText('No customers yet. Customers you add show here.');
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
  });

  it('refuses a file that is not Excel or CSV before uploading it', async () => {
    respond(() => ({ body: { items: [], nextCursor: null } }));
    show(<CustomersScreen query={allCustomers} columns={defaultCustomerColumns} />);
    const user = userEvent.setup({ applyAccept: false });
    await user.click(screen.getByRole('button', { name: 'Add customers' }));
    await user.click(screen.getByRole('button', { name: /Import from an Excel or CSV/ }));
    await user.upload(screen.getByLabelText('Customer file'), new File(['x'], 'list.pdf'));
    expect((await screen.findByRole('alert')).textContent).toContain('Only Excel (.xlsx) or CSV');
    expect(sent.some((request) => request.path === '/api/imports')).toBe(false);
  });

  it('refuses an .xlsx file that is not a spreadsheet', async () => {
    respond(() => ({ body: { items: [], nextCursor: null } }));
    show(<CustomersScreen query={allCustomers} columns={defaultCustomerColumns} />);
    const user = userEvent.setup({ applyAccept: false });
    await user.click(screen.getByRole('button', { name: 'Add customers' }));
    await user.click(screen.getByRole('button', { name: /Import from an Excel or CSV/ }));
    await user.upload(screen.getByLabelText('Customer file'), new File(['x'], 'list.xlsx'));
    expect((await screen.findByRole('alert')).textContent).toContain('could not be read');
    expect(sent.some((request) => request.path === '/api/imports')).toBe(false);
  });

  it('shows the Excel file the owner picked on the Detect step, not the CSV made from it', async () => {
    respond((path) =>
      path === '/api/imports'
        ? { body: { importId, uploadUrl: 'https://files.example.test/up' } }
        : { status: 200, body: { items: [], nextCursor: null } },
    );
    show(<CustomersScreen query={allCustomers} columns={defaultCustomerColumns} />);
    const user = userEvent.setup({ applyAccept: false });
    await user.click(screen.getByRole('button', { name: 'Add customers' }));
    await user.click(screen.getByRole('button', { name: /Import from an Excel or CSV/ }));
    const bytes = readFileSync('src/lib/fixtures/customers.xlsx');
    await user.upload(screen.getByLabelText('Customer file'), new File([bytes], 'shop-list.xlsx'));
    expect((await screen.findByRole('status')).textContent).toContain('shop-list.xlsx');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Step 2 of 7 · Detect')).toBeTruthy();
    expect(screen.getByText('File', { selector: 'dt' }).nextSibling?.textContent).toBe(
      'shop-list.xlsx',
    );
  });

  it('undoes a finished import after the owner confirms', async () => {
    let undone = false;
    respond((path) => {
      if (path.endsWith('/undo')) {
        undone = true;
        return { status: 202, body: done('undone') };
      }
      return {
        body: undone ? done('undone', { undoFinishedAt: '2026-11-20T10:00:00Z' }) : done('done'),
      };
    });
    show(<ImportResultStep importId={importId} onDone={() => undefined} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Undo import' }));
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Keep the import' }));
    expect(screen.getByRole('button', { name: 'Undo import' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
    expect(sent.some((request) => request.path.endsWith('/undo'))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Undo import' }));
    await user.click(screen.getByRole('button', { name: 'Yes, undo the import' }));
    expect(await screen.findByText('Undoing the import.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Undo import' })).toBeNull();
  });

  it('keeps waiting while the import has not started its job yet', async () => {
    const statuses = ['uploaded', 'mapped', 'done'];
    respond(() => ({ body: done(statuses.shift() ?? 'done') }));
    show(<ImportResultStep importId={importId} onDone={() => undefined} />);
    expect(await screen.findByText(/Importing customers/)).toBeTruthy();
    expect(await screen.findByText('Import finished.', {}, { timeout: 6000 })).toBeTruthy();
  });
});
