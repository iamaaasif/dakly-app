// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createSegmentSchema, type SegmentResponse } from '@dakly/contracts/segments';
import type { SessionContext } from '@dakly/contracts/sessions';

import { SegmentsScreen } from './segments-screen';
import { sessionContextKey } from '@/lib/session-context';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

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
});

const vip: SegmentResponse = {
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
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

type Request = { method: string; path: string; body: unknown };

function serve(reply: (request: Request) => Response) {
  const requests: Request[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const request = {
      method: init.method ?? 'GET',
      path: new URL(url, 'http://web.test').pathname.replace(/^\/api/, ''),
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
      canViewCampaigns: false,
      canEditCampaigns: false,
      canViewAutomations: false,
      canEditAutomations: false,
      canViewCustomers: true,
      canCreateCustomer: true,
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
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

async function choose(scope: HTMLElement, label: string, option: string) {
  const user = userEvent.setup();
  await user.click(within(scope).getByLabelText(label));
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('Segments screen', () => {
  it('lists a segment with its rule in words and its live count', async () => {
    const requests = serve(({ path }) =>
      path === '/segments/preview' ? json({ count: 42 }) : json({ items: [vip], nextCursor: null }),
    );
    show(<SegmentsScreen canEdit />);
    expect(screen.getByRole('status', { name: 'Loading segments' })).toBeTruthy();
    await screen.findByRole('heading', { name: 'VIP in Dhaka' });
    expect(
      screen.getByText('Tag is vip and (District is not Dhaka or agreed to SMS messages)'),
    ).toBeTruthy();
    expect(await screen.findByText('42 customers match')).toBeTruthy();
    expect(requests.find(({ path }) => path === '/segments/preview')?.body).toEqual({
      rules: vip.rules,
    });
  });

  it('shows a member who cannot edit only the list, even from an edit link', async () => {
    serve(({ path }) =>
      path === '/segments/preview' ? json({ count: 42 }) : json({ items: [vip], nextCursor: null }),
    );
    show(<SegmentsScreen edit={vip.id} canEdit={false} />);
    await screen.findByRole('heading', { name: 'VIP in Dhaka' });
    expect(screen.queryByRole('link', { name: 'Create segment' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Edit VIP in Dhaka' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete VIP in Dhaka' })).toBeNull();
    expect(screen.queryByLabelText('Segment name')).toBeNull();
  });

  it('shows the empty list and a failed list with a retry', async () => {
    let fail = true;
    serve(() =>
      fail
        ? json({ error: { code: 'FORBIDDEN', message: 'You cannot view segments.' } }, 403)
        : json({ items: [], nextCursor: null }),
    );
    show(<SegmentsScreen canEdit />);
    expect(await screen.findByText('You cannot view segments.')).toBeTruthy();
    fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry segments' }));
    expect(
      await screen.findByText('No segments yet. Create one to group customers for a campaign.'),
    ).toBeTruthy();
  });

  // Typing, five Radix select choices and the 400 ms count wait take about 2 s here and over 5 s on a busy CI runner.
  it('builds a valid two-level tree and saves it', async () => {
    const user = userEvent.setup();
    const requests = serve(({ path, method }) => {
      if (path === '/segments/preview') return json({ count: 7 });
      if (method === 'POST') return json({ ...vip, name: 'Repeat buyers' }, 201);
      return json({ items: [], nextCursor: null });
    });
    show(<SegmentsScreen edit="new" canEdit />);
    expect(
      await screen.findByText('Finish each condition to see how many customers match.'),
    ).toBeTruthy();
    await user.type(screen.getByLabelText('Segment name'), 'Repeat buyers');
    const first = screen.getByRole('group', { name: 'Condition 1' });
    await user.type(within(first).getByLabelText('Value'), 'vip');
    expect(await screen.findByText('7 customers match')).toBeTruthy();
    // Debounced: the half-typed values are never counted.
    expect(requests.filter(({ path }) => path === '/segments/preview')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Add condition group' }));
    const group = screen.getByRole('group', { name: 'Group 2' });
    await choose(group, 'Field', 'Marketing consent');
    await choose(group, 'Channel', 'WhatsApp');
    await user.click(within(group).getByRole('button', { name: 'Add condition to group 2' }));
    const second = screen.getByRole('group', { name: 'Group 2, condition 2' });
    await choose(second, 'Field', 'Source');
    await choose(second, 'Operator', 'is not');
    await choose(second, 'Value', 'Import');
    await user.click(screen.getByRole('button', { name: 'Save segment' }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/segments'));
    const saved = requests.find(({ path, method }) => path === '/segments' && method === 'POST');
    expect(saved?.body).toEqual({
      name: 'Repeat buyers',
      rules: {
        match: 'all',
        conditions: [
          { field: 'tag', operator: 'is_any_of', values: ['vip'] },
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

  it('refuses an empty value and shows a taken name on the name field', async () => {
    const user = userEvent.setup();
    const requests = serve(({ path, method }) => {
      if (path === '/segments/preview') return json({ count: 1 });
      if (method === 'PATCH')
        return json(
          {
            error: {
              code: 'SEGMENT_NAME_TAKEN',
              message: 'A segment with this name already exists',
            },
          },
          409,
        );
      return json({ items: [vip], nextCursor: null });
    });
    show(<SegmentsScreen edit={vip.id} canEdit />);
    const name = await screen.findByLabelText('Segment name');
    expect(await screen.findByText('1 customer matches')).toBeTruthy();
    const first = screen.getByRole('group', { name: 'Condition 1' });
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

  it('deletes a segment after naming it in the confirmation', async () => {
    const user = userEvent.setup();
    let items = [vip];
    serve(({ path, method }) => {
      if (path === '/segments/preview') return json({ count: 3 });
      if (method === 'DELETE') {
        items = [];
        return new Response(null, { status: 204, headers: { 'x-session-context': 'verified' } });
      }
      return json({ items, nextCursor: null });
    });
    show(<SegmentsScreen canEdit />);
    await user.click(await screen.findByRole('button', { name: 'Delete VIP in Dhaka' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete VIP in Dhaka?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete segment' }));
    expect(
      await screen.findByText('No segments yet. Create one to group customers for a campaign.'),
    ).toBeTruthy();
  });
});
