// @vitest-environment jsdom
import type * as ReactQuery from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@dakly/ui/api-client';

import { useSessionVerification } from './use-session-verification';

const { getClient } = vi.hoisted(() => ({ getClient: vi.fn() }));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof ReactQuery>()),
  useQueryClient: getClient,
}));
vi.mock('./session-context', () => ({
  sessionContextKey: ['session-context'],
  useSessionContext: () => ({}),
}));

const contextKey = ['session-context'];
const historyKey = ['security-history', 'account-A'];
const accountA = { contextTag: 'account-A' };
const accountB = { contextTag: 'account-B' };
let client: QueryClient;

async function acceptedAccount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  getClient.mockReturnValue(client);
  client.setQueryDefaults(contextKey, { queryFn: async () => accountA });
  const { result: verification } = renderHook(() => useSessionVerification());
  await act(() => verification.current.verify());
  client.setQueryData(historyKey, { privateHistory: 'Account A' });
  await client
    .getMutationCache()
    .build(client, { mutationFn: async () => 'Account A result' })
    .execute(undefined);
  return verification;
}

describe('session verification cache disposal', () => {
  afterEach(() => client?.clear());

  it('retains feature queries and mutation results when the accepted context is unchanged', async () => {
    const verification = await acceptedAccount();
    await act(() => verification.current.verify());
    expect(client.getQueryData(historyKey)).toEqual({ privateHistory: 'Account A' });
    expect(
      client
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.state.data),
    ).toEqual(['Account A result']);
  });

  it.each([accountA, accountB])(
    'compares resumed verification with the accepted context after paused publication of $contextTag',
    async (next) => {
      const verification = await acceptedAccount();
      const started = deferred();
      const release = deferred();
      client.setQueryDefaults(contextKey, {
        queryFn: async () => {
          started.resolve();
          await release.promise;
          return next;
        },
      });
      const pending = verification.current.verify();
      await started.promise;
      act(() => {
        verification.current.pause();
      });
      release.resolve();
      await act(() => pending);
      expect(client.getQueryData(contextKey)).toEqual(next);
      expect(client.getQueryData(historyKey)).toEqual({ privateHistory: 'Account A' });
      await act(() => verification.current.verify());
      if (next.contextTag === accountA.contextTag) {
        expect(client.getQueryData(historyKey)).toEqual({ privateHistory: 'Account A' });
        expect(client.getMutationCache().getAll()).toHaveLength(1);
      } else {
        expect(client.getQueryData(historyKey)).toBeUndefined();
        expect(client.getMutationCache().getAll()).toHaveLength(0);
      }
    },
  );
});

describe('expired session', () => {
  it('flags the expiry and keeps cached screens until sign-in works again', async () => {
    const verification = await acceptedAccount();
    client.setQueryDefaults(contextKey, {
      queryFn: async () => {
        throw new ApiError('AUTH_REQUIRED', 'Sign in', undefined, 401);
      },
    });
    await act(() => verification.current.verify());
    expect(verification.current.expired).toBe(true);
    expect(verification.current.available).toBe(true);
    expect(client.getQueryData(historyKey)).toEqual({ privateHistory: 'Account A' });
    client.setQueryDefaults(contextKey, { queryFn: async () => accountA });
    await act(() => verification.current.verify());
    expect(verification.current.expired).toBe(false);
  });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
