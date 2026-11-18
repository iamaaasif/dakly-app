// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
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

it.each([true, false])(
  'waits for the active detail to reconcile before completing the save (%s)',
  async (readSucceeds) => {
    const { client, queryKey, result } = setup();
    let releaseSave!: (response: Response) => void;
    let finishRead!: () => void;
    const saveResponse = new Promise<Response>((resolve) => (releaseSave = resolve));
    const authoritative = { ...saved, goal: 'win_back' } as const;
    const read = vi.fn(
      () =>
        new Promise<CampaignResponse>((resolve, reject) => {
          finishRead = () =>
            readSucceeds ? resolve(authoritative) : reject(new Error('Detail unavailable'));
        }),
    );
    const observer = new QueryObserver(client, {
      queryKey,
      queryFn: read,
      staleTime: Infinity,
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    const fetch = vi.fn(() => saveResponse);
    vi.stubGlobal('fetch', fetch);
    try {
      await act(async () => {
        let settled = false;
        const pending = result.current.mutateAsync({ id, input: { name: saved.name } }).then(() => {
          settled = true;
        });
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
        client.setQueryData(queryKey, { ...original, goal: 'win_back' });
        releaseSave(Response.json(saved, { headers: { 'x-session-context': contextTag } }));
        await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
        expect(settled).toBe(false);
        expect(client.getQueryData(queryKey)).toEqual({ ...original, goal: 'win_back' });
        finishRead();
        await pending;
      });
      expect(result.current.getCachedCampaign(id)).toEqual(
        readSucceeds ? authoritative : undefined,
      );
      expect(observer.getCurrentResult().status).toBe(readSucceeds ? 'success' : 'error');
    } finally {
      unsubscribe();
    }
  },
);

it.each([
  ['sent summary', { ...saved, status: 'sent' }],
  ['deletion', null],
] as const)('keeps the confirmed %s when a save conflict arrives late', async (_, terminal) => {
  const { client, queryKey, result } = setup();
  let releaseConflict!: (response: Response) => void;
  const conflict = new Promise<Response>((resolve) => (releaseConflict = resolve));
  const fetch = vi.fn(() => conflict);
  vi.stubGlobal('fetch', fetch);
  await act(async () => {
    const pending = result.current
      .mutateAsync({ id, input: { name: saved.name } })
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await client.fetchQuery({ queryKey, queryFn: async () => terminal });
    releaseConflict(
      Response.json(
        { error: { code: 'CAMPAIGN_NOT_DRAFT', message: 'This campaign is no longer a draft' } },
        { status: 409 },
      ),
    );
    expect(await pending).toMatchObject({ code: 'CAMPAIGN_NOT_DRAFT' });
  });
  expect(client.getQueryData(queryKey)).toEqual(terminal);
});

it.each([
  { status: 'scheduled', conflict: true },
  { status: 'scheduled', conflict: false },
  { status: 'draft', conflict: true },
] as const)(
  'keeps $status visible while reconciling a save (conflict $conflict)',
  async ({ status, conflict }) => {
    const { client, queryKey, result } = setup();
    let releaseSave!: (response: Response) => void;
    let finishRead!: (campaign: CampaignResponse) => void;
    const saveResponse = new Promise<Response>((resolve) => (releaseSave = resolve));
    const current = { ...original, status, goal: 'win_back' } as const;
    const refreshed = { ...current, status: 'draft' } as const;
    const fetch = vi.fn(() => saveResponse);
    vi.stubGlobal('fetch', fetch);
    const read = vi.fn(() => new Promise<CampaignResponse>((resolve) => (finishRead = resolve)));
    const observer = new QueryObserver(client, { queryKey, queryFn: read, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => undefined);
    try {
      await act(async () => {
        const pending = result.current
          .mutateAsync({ id, input: { name: saved.name } })
          .catch((error: unknown) => error);
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
        client.setQueryData(queryKey, current);
        releaseSave(
          conflict
            ? Response.json(
                {
                  error: {
                    code: 'CAMPAIGN_NOT_DRAFT',
                    message: 'This campaign is no longer a draft',
                  },
                },
                { status: 409 },
              )
            : Response.json(saved, { headers: { 'x-session-context': contextTag } }),
        );
        await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
        expect(client.getQueryData(queryKey)).toEqual(current);
        finishRead(refreshed);
        expect(await pending).toMatchObject(conflict ? { code: 'CAMPAIGN_NOT_DRAFT' } : saved);
      });
      expect(client.getQueryData(queryKey)).toEqual(refreshed);
    } finally {
      unsubscribe();
    }
  },
);
