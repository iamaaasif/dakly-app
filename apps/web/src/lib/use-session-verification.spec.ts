import type * as React from 'react';
import type * as ReactQuery from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { useSessionVerification } from './use-session-verification';

const { getClient } = vi.hoisted(() => ({ getClient: vi.fn() }));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof ReactQuery>()),
  useQueryClient: getClient,
}));
// Minimal hook bindings isolate the source lifecycle; query publication and disposal use real caches.
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useCallback: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [initial, vi.fn()],
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
  const verification = useSessionVerification();
  await verification.verify();
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
    await verification.verify();
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
      const pending = verification.verify();
      await started.promise;
      verification.pause();
      release.resolve();
      await pending;
      expect(client.getQueryData(contextKey)).toEqual(next);
      expect(client.getQueryData(historyKey)).toEqual({ privateHistory: 'Account A' });
      await verification.verify();
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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
