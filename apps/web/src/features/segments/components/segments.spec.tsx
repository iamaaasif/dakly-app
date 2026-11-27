// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  createSegmentSchema,
  type SegmentCondition,
  type SegmentInnerGroup,
  type SegmentListItem,
  type SegmentRules,
} from '@dakly/contracts/segments';
import type { SessionContext } from '@dakly/contracts/sessions';
import { ToastProvider } from '@dakly/ui/toast';

import { groupLooseConditions } from '../segment-labels';
import { SegmentsScreen } from './segments-screen';
import { sessionContextKey } from '@/lib/session-context';

const push = vi.fn();
const urlPush = vi.fn();
const urlReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/use-url-query', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUrlRouter: () => ({ push: urlPush, replace: urlReplace }),
}));

// jsdom lacks the pointer capture and scrolling the Radix select reads, and modal dialogs.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
  urlPush.mockReset();
  urlReplace.mockReset();
});

const vip: SegmentListItem = {
  id: '7d0f8a52-4c7e-4b8e-9a51-0e6f3f0b2c11',
  name: 'VIP in Dhaka',
  rules: {
    match: 'all',
    conditions: [
      { field: 'tag', operator: 'is_any_of', values: ['vip'] },
      {
        match: 'any',
        conditions: [
          { field: 'district', operator: 'is_none_of', values: ['Dhaka'] },
          { field: 'consent', channel: 'sms', granted: true },
        ],
      },
    ],
  },
  archivedAt: null,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  contactCount: 24,
};

type Request = { method: string; path: string; query: URLSearchParams; body: unknown };

function serve(reply: (request: Request) => Response) {
  const requests: Request[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const request = {
      method: init.method ?? 'GET',
      path: new URL(url, 'http://web.test').pathname.replace(/^\/api/, ''),
      query: new URL(url, 'http://web.test').searchParams,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    requests.push(request);
    return reply(request);
  });
  return requests;
}
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'x-session-context': 'verified' } });

function show(child: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const context: SessionContext = {
    user: { id: 'actor', name: 'Actor' },
    currentStore: {
      storeId: 'shop',
      name: 'Shop',
      canViewTeam: false,
      canEditTeam: false,
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
      canCreateCustomer: true,
      canExportCustomers: true,
      canViewChats: true,
      canEditChats: true,
      canViewSegments: true,
      canEditSegments: true,
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

async function choose(scope: HTMLElement, label: string, option: string) {
  const user = userEvent.setup();
  await user.click(within(scope).getByLabelText(label));
  await user.click(await screen.findByRole('option', { name: option }));
}

const counts = { all: 24, active: 16, archived: 8 };
const reachable = { whatsapp: 5, sms: 4, messenger: 2 };
const emptyView = { status: 'all' as const };

// The list, its tab counts and the live count, with a handler for anything else.
function listServer(
  items: SegmentListItem[],
  other: (request: Request) => Response | undefined = () => undefined,
) {
  return serve((request) => {
    const custom = other(request);
    if (custom) return custom;
    if (request.path === '/segments/preview') return json({ count: 7, reachable });
    if (request.path === '/segments/counts') return json(counts);
    return json({ items, nextCursor: null });
  });
}

describe('Segments list', () => {
  it('shows tabs with counts and each segment with its contacts and last edit', async () => {
    const requests = listServer([vip]);
    show(<SegmentsScreen view={emptyView} canEdit />);
    expect(screen.getByRole('status', { name: 'Loading segments' })).toBeTruthy();
    await screen.findAllByRole('link', { name: 'VIP in Dhaka' });
    expect(await screen.findByRole('tab', { name: 'All 24' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Active 16' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Archive 8' })).toBeTruthy();
    expect(screen.getAllByText('24 contacts').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Nov 1, 2026 at 6:00 AM/).length).toBeGreaterThan(0);
    expect(requests.find(({ path }) => path === '/segments')?.query.get('status')).toBe('all');
  });

  it('moves to the archive tab and searches by name through the address', async () => {
    const user = userEvent.setup();
    listServer([vip]);
    show(<SegmentsScreen view={emptyView} canEdit />);
    await user.click(await screen.findByRole('tab', { name: /Archive/ }));
    expect(urlPush).toHaveBeenCalledWith('/segments?status=archived');
    await user.type(screen.getByLabelText('Search segments'), 'vip');
    await vi.waitFor(() => expect(urlReplace).toHaveBeenCalledWith('/segments?search=vip'));
  });

  it('shows the empty state with Add Segment when the shop has none', async () => {
    serve((request) =>
      request.path === '/segments/counts'
        ? json({ all: 0, active: 0, archived: 0 })
        : json({ items: [], nextCursor: null }),
    );
    show(<SegmentsScreen view={emptyView} canEdit />);
    expect(await screen.findByText('You don’t have any segment yet')).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Add Segment' })).toHaveLength(2);
  });

  it('archives from the row menu', async () => {
    const user = userEvent.setup();
    const requests = listServer([vip]);
    show(<SegmentsScreen view={emptyView} canEdit />);
    await user.click(
      (await screen.findAllByRole('button', { name: 'More actions for VIP in Dhaka' }))[0]!,
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    await vi.waitFor(() =>
      expect(requests.some(({ path }) => path === `/segments/${vip.id}/archive`)).toBe(true),
    );
  });

  it('archives several selected segments at once', async () => {
    const user = userEvent.setup();
    const requests = listServer([vip]);
    show(<SegmentsScreen view={emptyView} canEdit />);
    await user.click((await screen.findAllByRole('checkbox', { name: 'Select VIP in Dhaka' }))[0]!);
    const bar = screen.getByRole('region', { name: 'Selected segments' });
    expect(within(bar).getByText('1 selected')).toBeTruthy();
    await user.click(within(bar).getByRole('button', { name: 'Archive' }));
    await vi.waitFor(() =>
      expect(requests.some(({ path }) => path === `/segments/${vip.id}/archive`)).toBe(true),
    );
  });

  it('offers a member who cannot edit only View', async () => {
    listServer([vip]);
    show(<SegmentsScreen view={{ ...emptyView, edit: vip.id }} canEdit={false} />);
    await screen.findByRole('heading', { name: 'VIP in Dhaka' });
    expect(screen.queryByLabelText('Segment name')).toBeTruthy();
    expect(screen.getByLabelText('Segment name').matches(':disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save segment' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Edit segment' })).toBeNull();
  });

  it('shows a failed list with a retry', async () => {
    let fail = true;
    serve((request) => {
      if (request.path === '/segments/counts') return json(counts);
      if (fail)
        return json({ error: { code: 'FORBIDDEN', message: 'You cannot view segments.' } }, 403);
      return json({ items: [vip], nextCursor: null });
    });
    show(<SegmentsScreen view={emptyView} canEdit />);
    expect(await screen.findByText('You cannot view segments.')).toBeTruthy();
    fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry segments' }));
    expect(await screen.findAllByRole('link', { name: 'VIP in Dhaka' })).toBeTruthy();
  });

  it('deletes a segment after naming it in the confirmation', async () => {
    const user = userEvent.setup();
    let items = [vip];
    const requests = listServer(items, ({ path, method }) => {
      if (path === `/segments/${vip.id}` && method === 'DELETE') {
        items = [];
        return new Response(null, { status: 204, headers: { 'x-session-context': 'verified' } });
      }
      return undefined;
    });
    show(<SegmentsScreen view={emptyView} canEdit />);
    await user.click(
      (await screen.findAllByRole('button', { name: 'More actions for VIP in Dhaka' }))[0]!,
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete VIP in Dhaka?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete segment' }));
    await vi.waitFor(() => expect(requests.some(({ method }) => method === 'DELETE')).toBe(true));
  });
});

describe('Segment builder', () => {
  // Typing, five Radix select choices and the 400 ms count wait take about 2 s here and over 5 s on a busy CI runner.
  it('builds a valid two-level tree and saves it', async () => {
    const user = userEvent.setup();
    const requests = listServer([], ({ method, path }) =>
      method === 'POST' && path === '/segments'
        ? json({ ...vip, name: 'Repeat buyers' }, 201)
        : undefined,
    );
    show(<SegmentsScreen view={{ ...emptyView, edit: 'new' }} canEdit />);
    expect(
      await screen.findByText('Finish each condition to see how many contacts match.'),
    ).toBeTruthy();
    await user.type(screen.getByLabelText('Segment name'), 'Repeat buyers');
    const first = screen.getByRole('group', { name: 'Group 1, condition 1' });
    await user.type(within(first).getByLabelText('Value'), 'vip');
    expect(await screen.findByText('Estimated contacts')).toBeTruthy();
    expect(screen.getByText('WhatsApp')).toBeTruthy();
    // Debounced: the half-typed values are never counted.
    expect(requests.filter(({ path }) => path === '/segments/preview')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Add condition group' }));
    const group = screen.getByRole('group', { name: 'Group 2, condition 1' });
    await choose(group, 'Field', 'Marketing consent');
    await choose(group, 'Channel', 'WhatsApp');
    await user.click(screen.getByRole('button', { name: 'Add condition to group 2' }));
    const second = screen.getByRole('group', { name: 'Group 2, condition 2' });
    await choose(second, 'Field', 'Source');
    await choose(second, 'Operator', 'is not');
    await choose(second, 'Value', 'Import');
    await user.click(
      within(screen.getByRole('group', { name: 'Group 2 matches' })).getByText('ANY'),
    );
    await user.click(screen.getByRole('button', { name: 'Save segment' }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/segments'));
    const saved = requests.find(({ path, method }) => path === '/segments' && method === 'POST');
    expect(saved?.body).toEqual({
      name: 'Repeat buyers',
      rules: {
        match: 'all',
        conditions: [
          { match: 'all', conditions: [{ field: 'tag', operator: 'is_any_of', values: ['vip'] }] },
          {
            match: 'any',
            conditions: [
              { field: 'consent', channel: 'whatsapp', granted: true },
              { field: 'source', operator: 'is_none_of', values: ['import'] },
            ],
          },
        ],
      },
    });
    expect(createSegmentSchema.safeParse(saved?.body).success).toBe(true);
  }, 15_000);

  it('opens a saved segment with its loose conditions in a group, and refuses an empty value', async () => {
    const user = userEvent.setup();
    const requests = listServer([vip], ({ method }) =>
      method === 'PATCH'
        ? json(
            {
              error: {
                code: 'SEGMENT_NAME_TAKEN',
                message: 'A segment with this name already exists',
              },
            },
            409,
          )
        : undefined,
    );
    show(<SegmentsScreen view={{ ...emptyView, edit: vip.id }} canEdit />);
    const name = await screen.findByLabelText('Segment name');
    expect(await screen.findByText('Estimated contacts')).toBeTruthy();
    // The saved tree had one loose condition and one group; now both are groups.
    const first = screen.getByRole('group', { name: 'Group 1, condition 1' });
    expect(screen.getByRole('group', { name: 'Group 2, condition 1' })).toBeTruthy();
    await user.clear(within(first).getByLabelText('Value'));
    await user.click(screen.getByRole('button', { name: 'Save segment' }));
    expect(within(first).getByRole('alert')).toBeTruthy();
    expect(requests.some(({ method }) => method === 'PATCH')).toBe(false);
    await user.type(within(first).getByLabelText('Value'), 'gold');
    await user.clear(name);
    await user.type(name, 'Gold');
    await user.click(screen.getByRole('button', { name: 'Save segment' }));
    expect(await screen.findByText('A segment with this name already exists')).toBeTruthy();
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(push).not.toHaveBeenCalled();
  });
});

describe('groupLooseConditions', () => {
  const tag: SegmentCondition = { field: 'tag', operator: 'is_any_of', values: ['vip'] };
  const other: SegmentCondition = { field: 'tag', operator: 'is_any_of', values: ['gold'] };
  const inner: SegmentInnerGroup = { match: 'any', conditions: [tag, tag] };

  it('wraps loose conditions in one group that matches the way the top did', () => {
    expect(groupLooseConditions({ match: 'any', conditions: [tag, inner, other] })).toEqual({
      match: 'any',
      conditions: [{ match: 'any', conditions: [tag, other] }, inner],
    });
  });

  it('leaves a tree of groups alone', () => {
    const rules: SegmentRules = { match: 'all', conditions: [inner] };
    expect(groupLooseConditions(rules)).toBe(rules);
  });
});
