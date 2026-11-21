// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CampaignResponse } from '@dakly/contracts/campaigns';
import type { SessionContext } from '@dakly/contracts/sessions';
import { ToastProvider } from '@dakly/ui/toast';

import { CampaignDetail } from './campaign-detail';
import { sessionContextKey } from '@/lib/session-context';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/campaigns/x',
  useSearchParams: () => new URLSearchParams(),
}));

const campaignId = '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e71';
const base: CampaignResponse = {
  id: campaignId,
  name: 'Puja winback',
  goal: 'win_back',
  channel: 'sms',
  content: { text: 'Come back this week for our Puja collection.' },
  channelConnectionId: null,
  includeSegmentIds: [],
  excludeSegmentIds: [],
  source: null,
  scheduledFor: null,
  status: 'sent',
  approval: null,
  approvalFailureCode: null,
  startedAt: '2026-11-01T04:00:00Z',
  finishedAt: '2026-11-01T05:00:00Z',
  counts: {
    recipients: 100,
    skipped: 0,
    sent: 100,
    delivered: 98,
    read: 0,
    tapped: 20,
    failed: 2,
    countedAt: '2026-11-01T05:01:00Z',
  },
  attribution: { orders: '3', revenuePoisha: '120000' },
  createdAt: '2026-10-30T04:00:00Z',
  updatedAt: '2026-11-01T05:00:00Z',
};

const resultsBody = {
  costPoisha: '50000',
  returnPerTaka: 7,
  attributionWindowDays: 7,
  resultsFinalAt: '2026-11-08T05:00:00Z',
  failureReasons: [{ code: 'unknown', count: 2 }],
  smsFallbackCount: 0,
  optedOutCount: 1,
};

function show(campaign: CampaignResponse, canEditCampaigns = false) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    let body: unknown = campaign;
    if (url.includes('/results')) body = resultsBody;
    if (url.includes('/customers')) body = { items: [], nextCursor: null };
    return Response.json(body, { headers: { 'x-session-context': 'verified' } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const context = {
    user: { id: 'member', name: 'Member' },
    currentStore: { storeId: 'shop', name: 'Shop', canViewCampaigns: true, canEditCampaigns },
    contextTag: 'verified',
    hasMemberships: true,
  } as unknown as SessionContext;
  client.setQueryData(sessionContextKey, context);
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CampaignDetail campaignId={campaignId} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Campaign detail', () => {
  it('opens the results page for a campaign that started sending', async () => {
    show(base);
    expect(await screen.findByRole('heading', { name: 'Campaign results' })).toBeTruthy();
  });

  it('shows cost, return per taka, final date and the copy actions to an editor', async () => {
    show(base, true);
    expect(await screen.findByText('Return per ৳1')).toBeTruthy();
    expect(await screen.findByText('৳7')).toBeTruthy();
    // An SMS has no poisha rate, so cost is unknown rather than ৳0.
    expect(screen.queryByText('৳500')).toBeNull();
    expect(screen.getByText(/Results final on/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create follow-up' })).toBeTruthy();
    // An SMS has no read receipt, so there is nothing to resend.
    expect(screen.queryByRole('button', { name: /Resend/ })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Ordered' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Read' })).toBeNull();
  });

  it('hides the copy actions from a member who cannot edit campaigns', async () => {
    show(base);
    await screen.findByText('Return per ৳1');
    expect(screen.queryByRole('button', { name: 'Duplicate' })).toBeNull();
  });

  it('keeps the summary for a campaign cancelled before it started', async () => {
    show({
      ...base,
      status: 'cancelled',
      startedAt: null,
      finishedAt: null,
      attribution: undefined,
    });
    expect(await screen.findByRole('region', { name: 'Saved campaign' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Campaign results' })).toBeNull();
  });

  it('opens the results page for a campaign cancelled after it started', async () => {
    show({ ...base, status: 'cancelled', finishedAt: null });
    expect(await screen.findByRole('heading', { name: 'Campaign results' })).toBeTruthy();
  });
});
