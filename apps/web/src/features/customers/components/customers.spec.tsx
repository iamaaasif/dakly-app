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
  ContactResponse,
} from '@dakly/contracts/contacts';
import type { SessionContext } from '@dakly/contracts/sessions';
import { ToastProvider } from '@dakly/ui/toast';

import { defaultCustomerColumns } from '../customer-columns';
import { ContactsScreen } from './contacts-screen';
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
  ordersCount: 0,
  netSpendPoisha: 0,
  lastOrderAt: null,
  lifecycleStage: 'none',
  isHighValue: false,
};

type Reply = { status?: number; body?: unknown };
type Sent = { path: string; method: string; body: unknown };
let sent: Sent[] = [];

function respond(reply: (path: string, method: string) => Reply | Promise<never>) {
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    const method = init.method ?? 'GET';
    // The shop's tags are the same in every test.
    if (path === '/api/contacts/tags')
      return Response.json(['eid buyer', 'kurti lover'], {
        headers: { 'x-session-context': 'verified' },
      });
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
      canPrintShippingLabels: false,
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

const ordered = { limit: 50, sort: 'last_purchase', hasOrdered: true } as const;
const everyone = { limit: 50, sort: 'newest' } as const;
const counts = {
  all: 2486,
  customers: 2486,
  new: 186,
  returning: 1124,
  vip: 42,
  inactive: 128,
  highValue: 158,
  atRisk: 96,
  boughtMoreThanOnce: 1124,
  canReceiveMarketing: 2203,
};
const stats = {
  ordersCount: 11,
  netSpendPoisha: 3_890_000,
  lastOrderAt: '2026-10-30T08:00:00Z',
  lifecycleStage: 'best',
} as const;

// The list and the tab counts come from the same fake API.
function respondWithList(items: ContactListItemResponse[], extra: Record<string, unknown> = {}) {
  respond((path) => {
    if (path.startsWith('/api/contacts/counts')) return { body: counts };
    return { body: { items, nextCursor: null, total: items.length, ...extra } };
  });
}

describe('All customers', () => {
  it('shows a skeleton while the list loads', async () => {
    respond(() => new Promise<never>(() => undefined));
    show(<CustomersScreen query={ordered} columns={defaultCustomerColumns} />);
    expect(await screen.findByText('Loading customers')).toBeTruthy();
  });

  it('asks only for people who ordered and says how many there are', async () => {
    respondWithList([rahimaInList]);
    show(<CustomersScreen query={ordered} columns={defaultCustomerColumns} />);
    expect(
      await screen.findByText(
        '2,486 customers · 1,124 bought more than once · 2,203 can receive marketing messages',
      ),
    ).toBeTruthy();
    expect(sent.find((request) => request.path.startsWith('/api/contacts?'))?.path).toBe(
      '/api/contacts?limit=50&sort=last_purchase&hasOrdered=true',
    );
    expect(sent.some((request) => request.path === '/api/contacts/counts?hasOrdered=true')).toBe(
      true,
    );
    expect(screen.queryByRole('button', { name: /Add/ })).toBeNull();
  });

  it('shows the type tabs with their counts', async () => {
    respondWithList([rahimaInList]);
    show(<CustomersScreen query={ordered} columns={defaultCustomerColumns} />);
    const tabs = within(await screen.findByRole('tablist', { name: 'Customer types' }));
    expect(await tabs.findByRole('tab', { name: /^All\s*2,486$/ })).toBeTruthy();
    expect(tabs.getByRole('tab', { name: /^High-value\s*158$/ })).toBeTruthy();
    expect(tabs.getByRole('tab', { name: /^At-risk\s*96$/ })).toBeTruthy();
  });

  it('puts a tab choice in the address and starts from the first page', async () => {
    respondWithList([rahimaInList]);
    show(
      <CustomersScreen
        query={{ ...ordered, cursor: contactId }}
        columns={defaultCustomerColumns}
      />,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: /^VIP/ }));
    expect(push).toHaveBeenCalledWith('/customers?type=vip');
  });

  it('says the store has no customers yet, without tabs or filters', async () => {
    respondWithList([]);
    show(<CustomersScreen query={ordered} columns={defaultCustomerColumns} />);
    expect(await screen.findByText("You don't have any customer yet")).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('says no customer matches the filters and offers to clear them', async () => {
    respondWithList([]);
    show(<CustomersScreen query={{ ...ordered, type: 'vip' }} columns={defaultCustomerColumns} />);
    expect(await screen.findByText('No customers match')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe(
      '/customers',
    );
  });

  it('offers a retry when the list fails', async () => {
    respond(() => apiError(503, 'UNAVAILABLE', 'Customers are not available right now'));
    show(<CustomersScreen query={ordered} columns={defaultCustomerColumns} />);
    expect(await screen.findByText('Customers are not available right now')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry customers' })).toBeTruthy();
  });

  it('shows the phone as the API sent it, the stats and the type, and links to the next page', async () => {
    respond((path) =>
      path.startsWith('/api/contacts/counts')
        ? { body: counts }
        : {
            body: {
              items: [
                { ...rahimaInList, ...stats },
                { ...rahimaInList, id: 'other', name: 'Karim Mia', phone: '01812345678' },
              ],
              nextCursor: contactId,
              total: 120,
            },
          },
    );
    show(<CustomersScreen query={ordered} columns={defaultCustomerColumns} />);
    const table = within(await screen.findByRole('table'));
    expect(table.getByText('01712-XXX678')).toBeTruthy();
    expect(table.getByText('01812-345678')).toBeTruthy();
    expect(table.getByText('VIP')).toBeTruthy();
    expect(table.getByText('৳38,900')).toBeTruthy();
    expect(table.getByText('Oct 30')).toBeTruthy();
    expect(table.getByRole('link', { name: 'Rahima Akter' }).getAttribute('href')).toBe(
      `/customers/${contactId}`,
    );
    expect(screen.getByText('Showing 2 of 120 customers')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe(
      `/customers?cursor=${contactId}`,
    );
  });

  it('shows the columns the address names and no others', async () => {
    respondWithList([rahimaInList]);
    show(
      <CustomersScreen
        query={ordered}
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
    expect(table.getByRole('columnheader', { name: 'Orders' })).toBeTruthy();
  });

  it('shows a quiet note where a column has no value', async () => {
    respondWithList([
      {
        ...rahimaInList,
        tags: [],
        whatsappPhone: null,
        phone: null,
        email: null,
        district: null,
        consentedChannels: [],
      },
    ]);
    show(
      <CustomersScreen
        query={ordered}
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

  it('counts the rows picked in the footer', async () => {
    respondWithList([rahimaInList]);
    show(<CustomersScreen query={ordered} columns={defaultCustomerColumns} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'Select Rahima Akter' }));
    expect(screen.getByText('Showing 1 of 1 customers · 1 selected')).toBeTruthy();
  });

  it('puts a column choice in the address and keeps the filters', async () => {
    respondWithList([rahimaInList]);
    show(<CustomersScreen query={{ ...ordered, type: 'vip' }} columns={defaultCustomerColumns} />);
    await screen.findByRole('table');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Email' }));
    // The screen is not re-rendered by the mocked router, so this starts from the defaults again.
    expect(replace).toHaveBeenCalledWith(
      '/customers?type=vip&columns=phone%2Cwhatsapp%2Clocation%2Csource%2Ctags',
    );
  });

  it('shows a short name search as an error on the search field', async () => {
    respond(() =>
      apiError(400, 'CONTACT_SEARCH_TOO_SHORT', 'Type at least 3 letters to search by name'),
    );
    show(<CustomersScreen query={{ ...ordered, search: 'ra' }} columns={defaultCustomerColumns} />);
    const search = await screen.findByRole('searchbox', { name: 'Search' });
    await waitFor(() => expect(search.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByRole('alert').textContent).toBe('Type at least 3 letters to search by name');
    expect(screen.queryByRole('button', { name: 'Retry customers' })).toBeNull();
  });

  it('puts the search in the address when Enter is pressed and starts from the first page', async () => {
    respondWithList([rahimaInList]);
    show(
      <CustomersScreen
        query={{ ...ordered, type: 'vip', cursor: contactId }}
        columns={defaultCustomerColumns}
      />,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByRole('searchbox', { name: 'Search' }), '01712345678{Enter}');
    expect(push).toHaveBeenCalledWith('/customers?type=vip&search=01712345678');
  });

  it('puts a source, spending, time and sort choice in the address', async () => {
    respondWithList([rahimaInList]);
    show(<CustomersScreen query={ordered} columns={defaultCustomerColumns} />);
    const user = userEvent.setup();
    // jsdom has no pointer capture or scrolling, which the menu asks for.
    window.HTMLElement.prototype.hasPointerCapture = () => false;
    window.HTMLElement.prototype.scrollIntoView = () => undefined;
    await user.click(await screen.findByRole('combobox', { name: 'Spending' }));
    await user.click(await screen.findByRole('option', { name: '৳1,000 to ৳10,000' }));
    expect(push).toHaveBeenLastCalledWith('/customers?minSpendPoisha=100000&maxSpendPoisha=999999');
    await user.click(screen.getByRole('combobox', { name: 'Sort' }));
    await user.click(await screen.findByRole('option', { name: 'Highest spend' }));
    expect(push).toHaveBeenLastCalledWith('/customers?sort=highest_spend');
  });
});

// A POST gets `reply`; the list and the counts come from the usual fake API.
function respondToContactPost(reply: Reply) {
  respond((path, method) => {
    if (method === 'POST') return reply;
    if (path.startsWith('/api/contacts/counts')) return { body: counts };
    return { body: { items: [rahimaInList], nextCursor: null, total: 1 } };
  });
}

describe('All contacts', () => {
  beforeEach(() => {
    // Radix selects need these in jsdom.
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.scrollIntoView = () => undefined;
    // The form's checkbox and selects measure themselves; jsdom has no ResizeObserver.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  const columns = defaultCustomerColumns;

  it('asks for everyone and shows no order columns, with the counts and tabs', async () => {
    respondWithList([{ ...rahimaInList, tags: ['eid'] }]);
    show(<ContactsScreen query={everyone} columns={columns} />);
    await screen.findByRole('table');
    expect(sent.find((request) => request.path.startsWith('/api/contacts?'))?.path).toBe(
      '/api/contacts?limit=50&sort=newest',
    );
    expect(screen.queryByRole('columnheader', { name: 'Orders' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Spent' })).toBeNull();
    expect(
      await screen.findByText(
        '2,486 contacts · 1,124 bought more than once · 2,203 can receive marketing messages',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^VIP\s*42$/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^At-risk\s*96$/ })).toBeTruthy();
  });

  it('offers every tag of the shop in the tag filter, not only the ones on screen', async () => {
    respondWithList([{ ...rahimaInList, tags: ['wholesale'] }]);
    show(<ContactsScreen query={everyone} columns={columns} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('combobox', { name: 'Tag' }));
    await user.click(await screen.findByRole('option', { name: 'kurti lover' }));
    expect(screen.queryByRole('option', { name: 'wholesale' })).toBeNull();
    expect(push).toHaveBeenCalledWith('/contacts?tag=kurti+lover');
  });

  it('selects rows and counts them in the footer', async () => {
    respondWithList([rahimaInList]);
    show(<ContactsScreen query={everyone} columns={columns} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'Select Rahima Akter' }));
    expect(screen.getByText(/1 selected/)).toBeTruthy();
  });

  it('says there are no contacts yet and offers to add one', async () => {
    respondWithList([]);
    show(<ContactsScreen query={everyone} columns={columns} />);
    expect(await screen.findByText("You don't have any contact yet")).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Add contact' })).toHaveLength(2);
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('puts a tab choice in the address', async () => {
    respondWithList([rahimaInList]);
    show(<ContactsScreen query={everyone} columns={columns} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: /^VIP/ }));
    expect(push).toHaveBeenCalledWith('/contacts?type=vip');
  });

  it('sends the whole form, keeping the WhatsApp number out when it is the mobile number', async () => {
    respondToContactPost({ status: 201, body: rahima });
    show(<ContactsScreen query={everyone} columns={columns} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add contact' }));
    await user.click(screen.getByRole('button', { name: /Add manually/ }));
    const dialog = within(screen.getByRole('dialog', { name: 'Add contact' }));
    await user.type(dialog.getByLabelText('Full name'), 'Rahim Ahmed');
    await user.type(dialog.getByLabelText('Mobile number'), '01712345678');
    await user.type(dialog.getByLabelText('Email (optional)'), 'rahim@example.com');
    await user.type(dialog.getByLabelText('Age (optional)'), '28');
    await user.type(dialog.getByLabelText('Address'), 'House 4, Road 2');
    await user.type(dialog.getByLabelText('Area'), 'Mirpur 10');
    await user.type(dialog.getByLabelText('Segments (optional)'), 'eid buyer{Enter}');
    await user.type(dialog.getByLabelText('Notes'), 'Size L');
    await user.click(dialog.getByRole('button', { name: 'Save contact' }));
    expect(await screen.findByText('Contact added')).toBeTruthy();
    expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
      name: 'Rahim Ahmed',
      phone: '01712345678',
      email: 'rahim@example.com',
      age: 28,
      address: 'House 4, Road 2, Mirpur 10',
      district: 'Dhaka',
      tags: ['eid buyer'],
      notes: 'Size L',
    });
  });

  it('sends a separate WhatsApp number once the box is unticked', async () => {
    respondWithList([rahimaInList]);
    show(<ContactsScreen query={everyone} columns={columns} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add contact' }));
    await user.click(screen.getByRole('button', { name: /Add manually/ }));
    const dialog = within(screen.getByRole('dialog', { name: 'Add contact' }));
    await user.type(dialog.getByLabelText('Full name'), 'Rahim Ahmed');
    await user.type(dialog.getByLabelText('Mobile number'), '01712345678');
    await user.click(dialog.getByRole('checkbox', { name: 'Same as mobile number' }));
    await user.type(dialog.getByLabelText('WhatsApp number'), '01812345678');
    await user.click(dialog.getByRole('button', { name: 'Save contact' }));
    await waitFor(() => expect(sent.some((request) => request.method === 'POST')).toBe(true));
    expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
      whatsappPhone: '01812345678',
    });
  });

  it('asks for a name and a mobile number, and shows a taken number on its field', async () => {
    respondToContactPost(
      apiError(409, 'CONTACT_PHONE_TAKEN', 'A contact with this phone number already exists'),
    );
    show(<ContactsScreen query={everyone} columns={columns} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add contact' }));
    await user.click(screen.getByRole('button', { name: /Add manually/ }));
    const dialog = within(screen.getByRole('dialog', { name: 'Add contact' }));
    await user.click(dialog.getByRole('button', { name: 'Save contact' }));
    expect(await dialog.findByText('Enter a name, up to 120 characters.')).toBeTruthy();
    expect(sent.some((request) => request.method === 'POST')).toBe(false);
    await user.type(dialog.getByLabelText('Full name'), 'Rahim Ahmed');
    await user.type(dialog.getByLabelText('Mobile number'), '01712345678');
    await user.click(dialog.getByRole('button', { name: 'Save contact' }));
    expect(await dialog.findByText('A contact with this phone number already exists')).toBeTruthy();
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
    show(<ContactsScreen query={everyone} columns={defaultCustomerColumns} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add contact' }));
    await user.click(screen.getByRole('button', { name: /Import from Excel or CSV/ }));
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
    show(<ContactsScreen query={everyone} columns={defaultCustomerColumns} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add contact' }));
    await user.click(screen.getByRole('button', { name: /Import from Excel or CSV/ }));
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
        query={{ ...ordered, type: 'vip', source: 'shopify' }}
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
    expect(
      urls.some((url) => url === '/api/contacts/export?type=vip&source=shopify&hasOrdered=true'),
    ).toBe(true);
  });

  it('offers no Export button without the Download customer lists switch', async () => {
    respondWithList([rahimaInList]);
    show(<CustomersScreen query={ordered} columns={defaultCustomerColumns} />);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
  });

  it('refuses a file that is not Excel or CSV before uploading it', async () => {
    respond(() => ({ body: { items: [], nextCursor: null } }));
    show(<ContactsScreen query={everyone} columns={defaultCustomerColumns} />);
    const user = userEvent.setup({ applyAccept: false });
    await user.click(await screen.findByRole('button', { name: 'Add contact' }));
    await user.click(screen.getByRole('button', { name: /Import from Excel or CSV/ }));
    await user.upload(screen.getByLabelText('Customer file'), new File(['x'], 'list.pdf'));
    expect((await screen.findByRole('alert')).textContent).toContain('Only Excel (.xlsx) or CSV');
    expect(sent.some((request) => request.path === '/api/imports')).toBe(false);
  });

  it('refuses an .xlsx file that is not a spreadsheet', async () => {
    respond(() => ({ body: { items: [], nextCursor: null } }));
    show(<ContactsScreen query={everyone} columns={defaultCustomerColumns} />);
    const user = userEvent.setup({ applyAccept: false });
    await user.click(await screen.findByRole('button', { name: 'Add contact' }));
    await user.click(screen.getByRole('button', { name: /Import from Excel or CSV/ }));
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
    show(<ContactsScreen query={everyone} columns={defaultCustomerColumns} />);
    const user = userEvent.setup({ applyAccept: false });
    await user.click(await screen.findByRole('button', { name: 'Add contact' }));
    await user.click(screen.getByRole('button', { name: /Import from Excel or CSV/ }));
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
