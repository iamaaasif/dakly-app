// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CampaignEstimateResponse, CampaignResponse } from '@dakly/contracts/campaigns';
import type { SessionContext } from '@dakly/contracts/sessions';

import { CampaignBuilder } from './campaign-builder';
import { sessionContextKey } from '@/lib/session-context';

const navigation = vi.hoisted(() => ({ push: vi.fn(), step: 'content' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: navigation.push }),
  usePathname: () => '/campaigns/draft',
  useSearchParams: () => new URLSearchParams({ step: navigation.step }),
}));

const pageId = '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e72';
const draft: CampaignResponse = {
  id: '0193a3c0-7b1e-7c3a-9f00-5a1b2c3d4e71',
  name: 'Eid offer',
  goal: null,
  channel: 'messenger',
  content: { text: '', imageUrl: null, buttons: [] },
  channelConnectionId: pageId,
  includeSegmentIds: [],
  excludeSegmentIds: [],
  source: null,
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
  audienceCount: 120,
  skippedByReason: { window_closed: 90, no_address: 10 },
  recipientsCount: 20,
  smsParts: 0,
  smsCredits: 0,
  costPoisha: 0,
};

function show() {
  const patches: unknown[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const headers = { 'x-session-context': 'verified' };
    if (init?.method === 'PATCH') {
      const change = JSON.parse(String(init.body)) as Partial<CampaignResponse>;
      patches.push(change);
      return Response.json({ ...draft, ...change, updatedAt: '2026-11-01T05:00:00Z' }, { headers });
    }
    if (url.includes('/estimate')) return Response.json(estimate, { headers });
    return Response.json(
      {
        items: [
          {
            id: pageId,
            kind: 'facebook_page',
            displayName: 'Nusrat Urban Trend',
            status: 'active',
          },
        ],
      },
      { headers },
    );
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
  navigation.step = 'content';
  navigation.push.mockClear();
  cleanup();
  vi.unstubAllGlobals();
});

describe('Messenger draft', () => {
  it('previews the message and explains why fewer people receive it', async () => {
    const patches = show();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Message'), 'Eid sale starts today');
    await user.click(screen.getByRole('button', { name: 'Add button' }));
    await user.type(screen.getByLabelText('Button 1'), 'See offers');
    const preview = screen.getByRole('region', { name: 'Message preview' });
    expect(preview.textContent).toContain('Eid sale starts today');
    expect(preview.textContent).toContain('See offers');
    const estimateCard = await screen.findByRole('region', { name: 'Estimate' });
    expect(estimateCard.textContent).toContain('last wrote more than 23 hours ago');
    expect(estimateCard.textContent).toContain('90');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({
      content: {
        text: 'Eid sale starts today',
        imageUrl: null,
        buttons: [{ title: 'See offers' }],
      },
    });
  });

  it('refuses an image link that is not https', async () => {
    const patches = show();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Image link/), 'http://shop.example/a.jpg');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(patches).toHaveLength(0);
  });

  it('saves the chosen goal and moves to the Content step on Continue', async () => {
    navigation.step = 'goal';
    const patches = show();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Win back customers'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith('/campaigns/draft?step=content'),
    );
    expect(patches).toEqual([{ goal: 'win_back' }]);
  });

  it('marks the current step and links back from Content', async () => {
    show();
    const current = await screen.findByRole('link', { current: 'step' });
    expect(current.textContent).toBe('2. Content');
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe(
      '/campaigns/draft?step=goal',
    );
  });
});
