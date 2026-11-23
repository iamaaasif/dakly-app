// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdList } from '@dakly/contracts/ad-links';
import type { SessionContext } from '@dakly/contracts/sessions';
import { ToastProvider } from '@dakly/ui/toast';

import { AdsTab } from './ads-tab';
import { sessionContextKey } from '@/lib/session-context';

const headers = { 'x-session-context': 'verified' };
const calls: { path: string; method?: string }[] = [];

const ads: AdList = {
  items: [
    {
      source: 'ad',
      externalId: '120000000001',
      title: 'ঈদের কুর্তি',
      photoUrl: null,
      status: 'suggested',
      products: [],
      suggestions: [
        { productId: crypto.randomUUID(), name: 'Cotton Kurti' },
        { productId: crypto.randomUUID(), name: 'Silk Orna' },
      ],
      lastSeenAt: '2026-11-23T10:00:00.000Z',
    },
    {
      source: 'post',
      externalId: '10001_5555',
      title: null,
      photoUrl: null,
      status: 'confirmed',
      products: [{ productId: crypto.randomUUID(), name: 'Red Panjabi' }],
      suggestions: [],
      lastSeenAt: '2026-11-22T10:00:00.000Z',
    },
  ],
};

function show(response: AdList = ads, canEdit = true) {
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    calls.push({ path, method: init?.method });
    if (init?.method === 'DELETE') return new Response(null, { status: 204, headers });
    return Response.json(init?.method === 'POST' ? { products: [] } : response, { headers });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    user: { id: 'member', name: 'Member' },
    currentStore: { storeId: 'shop', name: 'Shop' },
    contextTag: 'verified',
    hasMemberships: true,
  } as SessionContext);
  render(<AdsTab canEdit={canEdit} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    ),
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  calls.length = 0;
});

describe('Ads tab', () => {
  it('shows what an unconfirmed ad looks like and that the customer is asked meanwhile', async () => {
    show();
    expect(await screen.findByText('Cotton Kurti, Silk Orna')).toBeTruthy();
    expect(screen.getByText('Needs your check')).toBeTruthy();
    expect(screen.getByText(/Until you confirm, Dakly asks/)).toBeTruthy();
    expect(screen.getByText('Answers use: Red Panjabi')).toBeTruthy();
  });

  it('confirms the suggestions with one tap', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    await vi.waitFor(() =>
      expect(calls).toContainEqual({
        path: '/api/ads/ad/120000000001/confirm',
        method: 'POST',
      }),
    );
  });

  it('drops the suggestions when the owner says they are wrong', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Not these' }));
    await vi.waitFor(() =>
      expect(calls).toContainEqual({
        path: '/api/ads/ad/120000000001/suggestions',
        method: 'DELETE',
      }),
    );
  });

  it('gives a viewer the list without any buttons', async () => {
    show(ads, false);
    expect(await screen.findByText('Cotton Kurti, Silk Orna')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  });

  it('explains the empty list', async () => {
    show({ items: [] });
    expect(await screen.findByText(/No customer has messaged from an ad yet/)).toBeTruthy();
  });
});
