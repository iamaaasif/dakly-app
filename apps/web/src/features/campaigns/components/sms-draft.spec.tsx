// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CampaignEstimateResponse, CampaignResponse } from '@dakly/contracts/campaigns';
import type { SessionContext } from '@dakly/contracts/sessions';

import { CampaignBuilder } from './campaign-builder';
import { sessionContextKey } from '@/lib/session-context';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/campaigns/draft',
  useSearchParams: () => new URLSearchParams({ step: 'audience' }),
}));

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
  audienceCount: 40,
  skippedByReason: { no_consent: 6, no_address: 2 },
  recipientsCount: 32,
  smsParts: 1,
  smsCredits: 32,
  costPoisha: 0,
};
const segments = [
  { id: '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e81', name: 'Dhaka buyers' },
  { id: '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e82', name: 'Stopped buying' },
];

function show() {
  const patches: unknown[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const headers = { 'x-session-context': 'verified' };
    if (init?.method === 'PATCH') {
      const change = JSON.parse(String(init.body)) as Partial<CampaignResponse>;
      patches.push(change);
      return Response.json({ ...draft, ...change }, { headers });
    }
    if (url.includes('/estimate')) return Response.json(estimate, { headers });
    return Response.json({ items: segments, nextCursor: null }, { headers });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    user: { id: 'member', name: 'Member' },
    currentStore: { storeId: 'shop', name: 'Shop', canEditCampaigns: true },
    contextTag: 'verified',
    hasMemberships: true,
  } as unknown as SessionContext);
  render(
    <QueryClientProvider client={client}>
      <CampaignBuilder campaign={draft} />
    </QueryClientProvider>,
  );
  return patches;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SMS audience step', () => {
  it('saves the chosen segments and shows who will receive the message', async () => {
    const patches = show();
    const user = userEvent.setup();
    const sendTo = await screen.findByRole('group', { name: 'Send to' });
    await user.click(within(sendTo).getByRole('checkbox', { name: 'Dhaka buyers' }));
    const leaveOut = screen.getByRole('group', { name: 'Leave out' });
    expect(within(leaveOut).getByRole('checkbox', { name: 'Dhaka buyers' })).toHaveProperty(
      'disabled',
      true,
    );
    await user.click(within(leaveOut).getByRole('checkbox', { name: 'Stopped buying' }));
    const card = await screen.findByRole('region', { name: 'Estimate' });
    expect(card.textContent).toContain('32');
    expect(card.textContent).toContain('32 SMS credits');
    expect(card.textContent).toContain('2 have no phone number');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({
      includeSegmentIds: [segments[0]!.id],
      excludeSegmentIds: [segments[1]!.id],
    });
  });
});
