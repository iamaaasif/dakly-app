// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CampaignEstimateResponse, CampaignResponse } from '@dakly/contracts/campaigns';
import type { SessionContext } from '@dakly/contracts/sessions';

import { CampaignDetail } from './campaign-detail';
import { scheduledForOf, scheduleProblem, scheduleValuesOf } from './campaign-schedule';
import { sessionContextKey } from '@/lib/session-context';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/campaigns/draft',
  useSearchParams: () => new URLSearchParams({ step: 'schedule' }),
}));

const now = new Date('2026-11-21T04:00:00Z');
const draft: CampaignResponse = {
  id: '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e71',
  name: 'Winter sale',
  goal: null,
  channel: 'sms',
  content: { text: 'Winter sale today' },
  channelConnectionId: null,
  includeSegmentIds: [],
  excludeSegmentIds: [],
  scheduledFor: null,
  source: null,
  status: 'draft',
  approval: null,
  approvalFailureCode: null,
  startedAt: null,
  finishedAt: null,
  counts: {
    recipients: 0,
    skipped: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    tapped: 0,
    failed: 0,
    countedAt: null,
  },
  createdAt: '2026-11-01T04:00:00Z',
  updatedAt: '2026-11-01T04:00:00Z',
};
const estimate: CampaignEstimateResponse = {
  isComplete: true,
  audienceCount: 1840,
  skippedByReason: {},
  recipientsCount: 1832,
  smsParts: 1,
  smsCredits: 1832,
  costPoisha: 0,
};

function approvalResponse(error: string | undefined, headers: Record<string, string>) {
  if (!error) return Response.json({ ...draft, status: 'approving' }, { headers });
  return Response.json(
    { error: { code: 'CAMPAIGN_NO_RECIPIENTS', message: error } },
    { status: 409, headers },
  );
}

function testResponse(refused: string | undefined, headers: Record<string, string>) {
  if (!refused) return new Response(null, { status: 204, headers });
  return Response.json(
    { error: { code: 'CAMPAIGN_TEST_PHONE_REQUIRED', message: refused } },
    { status: 409, headers },
  );
}

function walletResponse(balance: number | 'refused', headers: Record<string, string>) {
  if (balance === 'refused')
    return Response.json({ error: { code: 'FORBIDDEN', message: 'No' } }, { status: 403, headers });
  return Response.json({ smsCredits: balance, whatsappPoisha: 0 }, { headers });
}

type ShowOptions = {
  balance: number | 'refused';
  approvalError?: string;
  testRefused?: string;
  start?: Partial<CampaignResponse>;
};

function otherResponse(url: string, options: ShowOptions, saved: CampaignResponse) {
  const headers = { 'x-session-context': 'verified' };
  if (url.endsWith('/test-send')) return testResponse(options.testRefused, headers);
  if (url.endsWith('/approve')) return approvalResponse(options.approvalError, headers);
  if (url.endsWith('/wallets')) return walletResponse(options.balance, headers);
  if (url.includes('/estimate')) return Response.json(estimate, { headers });
  if (url.endsWith(`/campaigns/${draft.id}`)) return Response.json(saved, { headers });
  return Response.json({ items: [], nextCursor: null }, { headers });
}

function show(options: ShowOptions) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  let saved = { ...draft, ...options.start };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const headers = { 'x-session-context': 'verified' };
    if (method === 'PATCH') {
      saved = { ...saved, ...(body as Partial<CampaignResponse>) };
      return Response.json(saved, { headers });
    }
    return otherResponse(url, options, saved);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    user: { id: 'member', name: 'Member' },
    currentStore: { storeId: 'shop', name: 'Shop', canViewCampaigns: true, canEditCampaigns: true },
    contextTag: 'verified',
    hasMemberships: true,
  } as unknown as SessionContext);
  render(
    <QueryClientProvider client={client}>
      <CampaignDetail campaignId={draft.id} />
    </QueryClientProvider>,
  );
  return calls;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('send time rules', () => {
  it('turns a Dhaka date and time into an instant and back', () => {
    const values = { mode: 'later', date: '2026-11-22', time: '19:30' } as const;
    expect(scheduledForOf(values)).toBe('2026-11-22T13:30:00.000Z');
    expect(scheduleValuesOf('2026-11-22T13:30:00.000Z')).toEqual(values);
  });

  it('sends on approval when the choice is now or the time is not filled in', () => {
    expect(scheduledForOf({ mode: 'now', date: '2026-11-22', time: '19:30' })).toBeNull();
    expect(scheduledForOf({ mode: 'later', date: '', time: '19:30' })).toBeNull();
  });

  it('refuses a missing, past or, for Messenger, more than 23 hours ahead time', () => {
    const later = (date: string, time: string) => ({ mode: 'later', date, time }) as const;
    expect(scheduleProblem(later('', ''), 'sms', now)).toBe('Pick a date and time.');
    expect(scheduleProblem(later('2026-11-21', '09:00'), 'sms', now)).toMatch(/not passed/);
    expect(scheduleProblem(later('2026-11-25', '09:00'), 'sms', now)).toBeUndefined();
    expect(scheduleProblem(later('2026-11-25', '09:00'), 'messenger', now)).toMatch(/23 hours/);
    expect(scheduleProblem(later('2026-11-22', '09:00'), 'messenger', now)).toBeUndefined();
  });
});

describe('Schedule step', () => {
  it('saves a chosen time and approves after the owner confirms', async () => {
    const calls = show({ balance: 5000 });
    const user = userEvent.setup({ advanceTimers: () => {} });
    await user.click(await screen.findByRole('radio', { name: /Schedule for later/ }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-22' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '19:30' } });
    await user.click(screen.getByRole('button', { name: 'Approve and launch' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve this campaign?' });
    expect(calls.find(({ method }) => method === 'PATCH')?.body).toEqual({
      scheduledFor: '2026-11-22T13:30:00.000Z',
    });
    await waitFor(() => expect(dialog.textContent).toContain('1,832 SMS credits'));
    expect(dialog.textContent).toContain('5,000 SMS credits');
    const approve = screen.getByRole('button', { name: 'Approve and schedule' });
    expect(approve).toHaveProperty('disabled', true);
    await user.click(screen.getByRole('checkbox'));
    await user.click(approve);
    await waitFor(() =>
      expect(calls.some(({ method, url }) => method === 'POST' && url.endsWith('/approve'))).toBe(
        true,
      ),
    );
  });

  it('stops the approval while the balance is lower than the cost', async () => {
    show({ balance: 100 });
    const user = userEvent.setup({ advanceTimers: () => {} });
    await user.click(await screen.findByRole('button', { name: 'Approve and launch' }));
    expect((await screen.findByRole('alert')).textContent).toContain('lower than the cost');
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Approve and send' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('leaves the balance out when the member cannot read billing', async () => {
    show({ balance: 'refused' });
    const user = userEvent.setup({ advanceTimers: () => {} });
    await user.click(await screen.findByRole('button', { name: 'Approve and launch' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.textContent).toContain('1,832 SMS credits'));
    expect(dialog.textContent).not.toContain('Your balance');
  });

  it('blocks Approve until a later time is complete and shows the API refusal', async () => {
    show({ balance: 5000, approvalError: 'No one in this audience can get this message' });
    const user = userEvent.setup({ advanceTimers: () => {} });
    await user.click(await screen.findByRole('radio', { name: /Schedule for later/ }));
    expect(screen.getByRole('button', { name: 'Approve and launch' })).toHaveProperty(
      'disabled',
      true,
    );
    expect((await screen.findByRole('alert')).textContent).toBe('Pick a date and time.');
    await user.click(screen.getByRole('radio', { name: /Send now/ }));
    await user.click(screen.getByRole('button', { name: 'Approve and launch' }));
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Approve and send' }));
    expect((await screen.findByText(/No one in this audience/)).getAttribute('role')).toBe('alert');
  });
});

describe('Test send', () => {
  it('sends a test SMS to the member’s own phone from the dialog', async () => {
    const calls = show({ balance: 5000 });
    const user = userEvent.setup({ advanceTimers: () => {} });
    await user.click(await screen.findByRole('button', { name: 'Approve and launch' }));
    await user.click(await screen.findByRole('button', { name: 'Send a test SMS to my phone' }));
    expect((await screen.findByRole('status')).textContent).toContain('Test sent to your phone');
    expect(calls.filter(({ url }) => url.endsWith('/test-send'))).toHaveLength(1);
  });

  it('shows why a test could not be sent', async () => {
    show({ balance: 5000, testRefused: 'Verify your phone number to receive a test message' });
    const user = userEvent.setup({ advanceTimers: () => {} });
    await user.click(await screen.findByRole('button', { name: 'Approve and launch' }));
    await user.click(await screen.findByRole('button', { name: 'Send a test SMS to my phone' }));
    expect(await screen.findByText(/Verify your phone number/)).toBeTruthy();
  });
});

describe('After Approve', () => {
  it('shows the audience check while the campaign is approving', async () => {
    show({
      balance: 5000,
      start: { status: 'approving', approval: { checked: 40, estimatedTotal: 1000 } },
    });
    expect(await screen.findByText(/40 of up to 1,000 people/)).toBeTruthy();
  });

  it('tells the owner why a failed approval came back as a draft', async () => {
    show({ balance: 5000, start: { approvalFailureCode: 'WALLET_BALANCE_TOO_LOW' } });
    expect((await screen.findByRole('alert')).textContent).toContain('balance was too low');
  });
});
