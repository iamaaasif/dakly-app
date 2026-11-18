// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import type { CampaignResponse } from '@dakly/contracts/campaigns';

import { campaignKeys } from './campaigns-key';
import { useSaveCampaign } from './save-campaign';
import { sessionContextKey } from '@/lib/session-context';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const contextTag = 'current-shop';
const id = '0196f5a2-3c4d-7e8f-9a0b-1c2d3e4f5a05';
const updatedAt = '2026-11-18T06:00:00.000Z';
const original: CampaignResponse = {
  id,
  name: 'First name',
  goal: null,
  channel: 'sms',
  content: { text: '' },
  includeSegmentIds: [],
  excludeSegmentIds: [],
  scheduledFor: null,
  status: 'draft',
  createdAt: updatedAt,
  updatedAt,
};
const saved = { ...original, name: 'Updated name' };

function setup() {
  const client = new QueryClient();
  const queryKey = campaignKeys.detail(contextTag, id);
  client.setQueryData(sessionContextKey, { contextTag, currentStore: { id: 'shop' } });
  client.setQueryData(queryKey, original);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(useSaveCampaign, { wrapper });
  return { client, queryKey, result };
}

it('keeps a saved campaign when an earlier detail request returns afterward', async () => {
  const { client, queryKey, result } = setup();
  vi.stubGlobal('fetch', async () =>
    Response.json(saved, { headers: { 'x-session-context': contextTag } }),
  );

  let releaseOldResponse!: (campaign: CampaignResponse) => void;
  const oldResponse = new Promise<CampaignResponse>((resolve) => (releaseOldResponse = resolve));
  const read = client.fetchQuery({ queryKey, queryFn: () => oldResponse }).catch(() => undefined);

  await act(async () => {
    await result.current.mutateAsync({ id, input: { name: saved.name } });
  });
  expect(client.getQueryData(queryKey)).toEqual(saved);
  releaseOldResponse(original);
  await read;
  expect(client.getQueryData(queryKey)).toEqual(saved);
});

it.each([
  ['approval', { ...saved, status: 'scheduled' }],
  ['deletion', null],
  ['draft edit', { ...saved, name: 'Later edit', updatedAt: '2026-11-18T06:00:01.000Z' }],
  ['draft edit with the same timestamp', { ...saved, name: 'Later edit' }],
  [
    'draft edit with an earlier clock',
    { ...saved, name: 'Later edit', updatedAt: '2026-11-18T05:59:59.000Z' },
  ],
] as const)('keeps a newer %s when the save response arrives late', async (_, terminal) => {
  const { client, queryKey, result } = setup();
  let releaseSave!: (response: Response) => void;
  const saveResponse = new Promise<Response>((resolve) => (releaseSave = resolve));
  const fetch = vi.fn(() => saveResponse);
  vi.stubGlobal('fetch', fetch);

  await act(async () => {
    const pending = result.current.mutateAsync({ id, input: { name: saved.name } });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await client.fetchQuery({ queryKey, queryFn: async () => terminal });
    releaseSave(Response.json(saved, { headers: { 'x-session-context': contextTag } }));
    await pending;
  });

  expect(client.getQueryData(queryKey)).toEqual(terminal);
});
