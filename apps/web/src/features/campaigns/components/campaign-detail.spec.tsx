// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CampaignResponse } from '@dakly/contracts/campaigns';
import type { SessionContext } from '@dakly/contracts/sessions';

import { CampaignDetail } from './campaign-detail';
import { sessionContextKey } from '@/lib/session-context';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const campaignId = '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e71';
const base: CampaignResponse = {
  id: campaignId,
  name: 'Puja winback',
  goal: 'win_back',
  channel: 'sms',
  content: { text: 'Come back this week for our Puja collection.' },
  includeSegmentIds: [],
  excludeSegmentIds: [],
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

function show(campaign: CampaignResponse) {
  vi.stubGlobal('fetch', async () =>
    Response.json(campaign, { headers: { 'x-session-context': 'verified' } }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const context = {
    user: { id: 'member', name: 'Member' },
    currentStore: { storeId: 'shop', name: 'Shop', canViewCampaigns: true },
    contextTag: 'verified',
    hasMemberships: true,
  } as unknown as SessionContext;
  client.setQueryData(sessionContextKey, context);
  render(
    <QueryClientProvider client={client}>
      <CampaignDetail campaignId={campaignId} />
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
