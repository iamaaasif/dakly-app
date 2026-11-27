import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { AccountSecurityEvent } from '@dakly/contracts/account-security-events';
import type { CreateSessionInput, Session, SessionContext } from '@dakly/contracts/sessions';
import type { PermissionArea, StoreAccess } from '@dakly/contracts/team';

import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { UsersService } from '../auth/users.service';
import { Clock } from '../platform/clock';
import { hashToken } from '../platform/crypto/token-hash';
import { AccountTransaction } from '../platform/database/account-transaction';
import { AppError, PLATFORM_ERRORS } from '../platform/errors/app-error';
import { DAY_MS } from '../platform/time';
import { TeamService } from '../team/team.service';
import { sessionContextTag } from './session-context';
import { sessionError } from './sessions.errors';
import { SessionsRepository } from './sessions.repository';

const TOUCH_INTERVAL = 5 * 60 * 1000;

const PURGE_BATCH = 5000;

@Injectable()
export class SessionsService {
  constructor(
    @Inject(SessionsRepository) private readonly repository: SessionsRepository,
    @Inject(AccountTransaction) private readonly transaction: AccountTransaction,
    @Inject(AccountSecurityEventsService) private readonly events: AccountSecurityEventsService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}

  async context(
    userId: string,
    sessionId: string,
    storeId?: string,
    access?: StoreAccess,
  ): Promise<SessionContext> {
    const [profile, metadata] = await Promise.all([
      this.users.profile(userId),
      this.team.storeContext(userId, storeId),
    ]);
    // Turned-off extensions hide their pages from the menu; the data stays.
    const extensions =
      metadata.storeId && access ? await this.team.storeExtensions(metadata.storeId) : [];
    const selected =
      metadata.storeId && metadata.name ? { storeId: metadata.storeId, name: metadata.name } : null;
    return {
      user: { id: profile.id, name: profile.name },
      hasMemberships: metadata.hasMemberships,
      currentStore:
        selected && access
          ? {
              ...selected,
              ...this.storeFlags(access, extensions),
            }
          : null,
      contextTag: sessionContextTag(sessionId, storeId, access),
    };
  }

  private storeFlags(access: StoreAccess, extensions: string[]) {
    const can = (extension: string, area: PermissionArea, level: 'view' | 'edit') =>
      extensions.includes(extension) && this.team.canAccess(access, area, level);
    const canViewOrders = can('sales', 'orders', 'view');
    return {
      canViewProducts: can('sales', 'products', 'view'),
      canEditProducts: can('sales', 'products', 'edit'),
      canViewOrders,
      canExportOrders: canViewOrders && access.exportLists,
      canEditOrders: can('sales', 'orders', 'edit'),
      canViewDueBook: can('physical_shop', 'dueBook', 'view'),
      canEditDueBook: can('physical_shop', 'dueBook', 'edit'),
      canViewCampaigns: this.team.canAccess(access, 'campaigns', 'view'),
      canViewAnalytics: this.team.canAccess(access, 'analytics', 'view'),
      canChangeAttributionWindow: this.team.canChangeAttributionWindow(access),
      canEditCampaigns: this.team.canAccess(access, 'campaigns', 'edit'),
      canViewSocial: can('social_auto_post', 'social', 'view'),
      canEditSocial: can('social_auto_post', 'social', 'edit'),
      canViewAutomations: this.team.canAccess(access, 'automations', 'view'),
      canEditAutomations: this.team.canAccess(access, 'automations', 'edit'),
      canViewCustomers: this.team.canAccess(access, 'customers', 'view'),
      canCreateCustomer: this.team.canAccess(access, 'customers', 'edit'),
      canExportCustomers: this.team.canExportCustomers(access),
      canViewChats: can('chats', 'chats', 'view'),
      canEditChats: can('chats', 'chats', 'edit'),
      canViewSegments: this.team.canAccess(access, 'segments', 'view'),
      canEditSegments: this.team.canAccess(access, 'segments', 'edit'),
      canApproveSupport: this.team.canApproveSupport(access),
      canViewStoreSettings: this.team.canAccess(access, 'storeSettings', 'view'),
      canEditStoreSettings: this.team.canAccess(access, 'storeSettings', 'edit'),
      canChangeExtensions: this.team.canChangeExtensions(access),
      canViewTeam: this.team.canAccess(access, 'team', 'view'),
      canEditTeam: this.team.canAccess(access, 'team', 'edit'),
      canTransferOwnership: this.team.canTransferOwnership(access),
    };
  }

  async list(userId: string, currentSessionId: string, before?: string) {
    const rows = await this.repository.list(userId, this.clock.now(), before);
    return {
      items: rows.map(({ userId: _userId, activeStoreId: _storeId, userAgent, ...session }) => ({
        ...session,
        userAgent,
        device: deviceName(userAgent),
        isCurrent: session.id === currentSessionId,
      })),
      nextCursor: rows.length === 100 ? rows.at(-1)!.id : null,
    };
  }

  isActive(userId: string, sessionId: string) {
    return this.repository.isActive(userId, sessionId, this.clock.now());
  }

  knownDevice(userId: string, ip: string, userAgent?: string) {
    return this.repository.knownDevice(userId, ip, userAgent);
  }

  async create(
    userId: string,
    { selectFirstStore, ...input }: CreateSessionInput & { selectFirstStore?: boolean },
  ): Promise<{ token: string; session: Session }> {
    const token = randomBytes(32).toString('base64url');
    const now = this.clock.now();
    const firstStore = selectFirstStore
      ? (await this.team.storesFor(userId, { limit: 1 })).items[0]
      : undefined;
    const session = await this.repository.insert(userId, {
      tokenHash: hashToken(token),
      input,
      now,
      expiresAt: new Date(now.getTime() + lifetimeMilliseconds(input.isRemembered)),
      activeStoreId: firstStore?.storeId,
    });
    return { token, session };
  }

  async resolve(token: string): Promise<Session | undefined> {
    const session = await this.repository.findByTokenHash(hashToken(token), this.clock.now());
    const now = this.clock.now();
    if (!session || session.expiresAt.getTime() <= now.getTime()) return undefined;
    if (session.lastSeenAt.getTime() <= now.getTime() - TOUCH_INTERVAL) {
      await this.repository.touch(session.userId, session.id, {
        lifetimeMilliseconds: lifetimeMilliseconds(session.isRemembered),
        absoluteExpiresAt: new Date(session.createdAt.getTime() + ABSOLUTE_SESSION_LIFETIME_MS),
        touchInterval: TOUCH_INTERVAL,
      });
    }
    return session;
  }

  revoke(userId: string, sessionId: string): Promise<void> {
    return this.revokeSessions(userId, sessionId, false);
  }

  revokeOthers(userId: string, sessionId: string): Promise<void> {
    return this.revokeSessions(userId, sessionId, true);
  }

  async revokeAll(
    userId: string,
    ip: string,
    actor: AccountSecurityEvent['actor'] = { kind: 'user' },
  ): Promise<void> {
    await this.transaction.run(userId, async () => {
      await this.users.invalidateChallenges(userId);
      await this.repository.revokeAll(userId, this.clock.now());
      await this.events.record(userId, { event: 'sessions.revoked', actor, ip });
    });
  }

  async setActiveStore(userId: string, sessionId: string, storeId: string): Promise<void> {
    if (!(await this.team.accessFor(storeId, userId))) throw sessionError('STORE_NOT_FOUND');
    if (!(await this.repository.setActiveStore(userId, sessionId, storeId, this.clock.now())))
      throw new AppError('AUTH_REQUIRED', PLATFORM_ERRORS.AUTH_REQUIRED);
  }

  private async revokeSessions(userId: string, sessionId: string, others: boolean): Promise<void> {
    await this.transaction.run(userId, async () => {
      await this.users.lockAccount(userId);
      const changed = await this.repository.revoke(userId, sessionId, this.clock.now(), others);
      if (changed) {
        await this.users.invalidateChallenges(userId);
        await this.events.record(userId, {
          event: 'sessions.revoked',
          actor: { kind: 'user' },
          details: { sessionId },
        });
      }
    });
  }

  async purgeExpired(): Promise<void> {
    while (await this.repository.purgeExpiredBatch(PURGE_BATCH));
  }
}

// D38: activity never keeps a session past 90 days from sign-in.
const ABSOLUTE_SESSION_LIFETIME_MS = 90 * DAY_MS;

function lifetimeMilliseconds(isRemembered: boolean): number {
  return (isRemembered ? 30 * 24 : 12) * 60 * 60 * 1000;
}

function deviceName(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browsers: Array<[RegExp, string]> = [
    [/Edg\//, 'Edge'],
    [/Firefox\//, 'Firefox'],
    [/Chrome\//, 'Chrome'],
    [/Safari\//, 'Safari'],
  ];
  const devices: Array<[RegExp, string]> = [
    [/Android/, 'Android'],
    [/iPhone|iPad/, 'iOS'],
    [/Windows/, 'Windows'],
    [/Macintosh/, 'macOS'],
    [/Linux/, 'Linux'],
  ];
  const browser = browsers.find(([pattern]) => pattern.test(userAgent))?.[1] ?? 'Browser';
  const device = devices.find(([pattern]) => pattern.test(userAgent))?.[1] ?? 'Unknown device';
  return `${browser} on ${device}`;
}
