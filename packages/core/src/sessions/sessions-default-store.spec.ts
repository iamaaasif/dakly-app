import { describe, expect, it, vi } from 'vitest';

import type { Session } from '@dakly/contracts/sessions';

import type { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import type { UsersService } from '../auth/users.service';
import type { Clock } from '../platform/clock';
import type { AccountTransaction } from '../platform/database/account-transaction';
import type { TeamService } from '../team/team.service';
import type { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

const now = new Date('2026-11-28T04:00:00Z');
const stores = { first: 'store-first', lastUsed: 'store-last' };

function build({ lastUsed, canUseLastUsed }: { lastUsed?: string; canUseLastUsed: boolean }) {
  const repository = {
    lastUsedStoreId: vi.fn(async () => lastUsed),
    insert: vi.fn(async (_userId: string, input: { activeStoreId?: string }) => ({
      id: 'session-1',
      activeStoreId: input.activeStoreId ?? null,
    })),
    setActiveStore: vi.fn(async () => true),
    findByTokenHash: vi.fn(async () => ({
      id: 'session-1',
      userId: 'user-1',
      activeStoreId: null,
      isRemembered: false,
      lastSeenAt: now,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
    })),
  };
  const team = {
    accessFor: vi.fn(async (storeId: string) =>
      canUseLastUsed && storeId === stores.lastUsed ? {} : undefined,
    ),
    storesFor: vi.fn(async () => ({
      items: [{ storeId: stores.first, name: 'First' }],
      nextCursor: null,
    })),
  };
  const service = new SessionsService(
    repository as unknown as SessionsRepository,
    {} as AccountTransaction,
    {} as AccountSecurityEventsService,
    { now: () => now } as Clock,
    team as unknown as TeamService,
    {} as UsersService,
  );
  return { service, repository };
}

describe('default shop on sign-in', () => {
  it('starts a new session on the shop used last', async () => {
    const { service } = build({ lastUsed: stores.lastUsed, canUseLastUsed: true });
    const { session } = (await service.create('user-1', { isRemembered: false })) as {
      session: Session;
    };
    expect(session.activeStoreId).toBe(stores.lastUsed);
  });

  it('falls back to the first shop when the last one is no longer accessible', async () => {
    const { service } = build({ lastUsed: stores.lastUsed, canUseLastUsed: false });
    const { session } = (await service.create('user-1', { isRemembered: false })) as {
      session: Session;
    };
    expect(session.activeStoreId).toBe(stores.first);
  });

  it('gives an existing session without a shop the first shop and saves it', async () => {
    const { service, repository } = build({ canUseLastUsed: false });
    const session = await service.resolve('token');
    expect(session?.activeStoreId).toBe(stores.first);
    expect(repository.setActiveStore).toHaveBeenCalledWith(
      'user-1',
      'session-1',
      stores.first,
      now,
    );
  });
});
