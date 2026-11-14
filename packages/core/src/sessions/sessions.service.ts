import { TeamService } from '../team/team.service';
import { AppError, PLATFORM_ERRORS } from '../platform/errors/app-error';
import { sessionError } from './sessions.errors';
import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CreateSessionInput, Session } from '@dakly/contracts/sessions';
import { AccountTransaction } from '../platform/database/account-transaction';
import { Clock } from '../platform/clock';
import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { SessionsRepository } from './sessions.repository';

const TOUCH_INTERVAL = 5 * 60 * 1000;

@Injectable()
export class SessionsService {
  constructor(
    @Inject(SessionsRepository) private readonly repository: SessionsRepository,
    @Inject(AccountTransaction) private readonly transaction: AccountTransaction,
    @Inject(AccountSecurityEventsService) private readonly events: AccountSecurityEventsService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(TeamService) private readonly team: TeamService,
  ) {}

  async create(
    userId: string,
    input: CreateSessionInput,
  ): Promise<{ token: string; session: Session }> {
    const token = randomBytes(32).toString('base64url');
    const now = this.clock.now();
    const session = await this.repository.insert(
      userId,
      hash(token),
      input,
      now,
      new Date(now.getTime() + lifetimeMilliseconds(input.isRemembered)),
    );
    return { token, session };
  }

  async resolve(token: string): Promise<Session | undefined> {
    const session = await this.repository.findByTokenHash(hash(token), this.clock.now());
    const now = this.clock.now();
    if (!session || session.expiresAt.getTime() <= now.getTime()) return undefined;
    if (session.lastSeenAt.getTime() <= now.getTime() - TOUCH_INTERVAL) {
      await this.repository.touch(
        session.userId,
        session.id,
        lifetimeMilliseconds(session.isRemembered),
        TOUCH_INTERVAL,
      );
    }
    return session;
  }

  revoke(userId: string, sessionId: string): Promise<void> {
    return this.revokeSessions(userId, sessionId, false);
  }

  revokeOthers(userId: string, sessionId: string): Promise<void> {
    return this.revokeSessions(userId, sessionId, true);
  }

  async revokeAll(userId: string, ip: string): Promise<void> {
    await this.transaction.run(userId, async () => {
      await this.repository.revokeAll(userId, this.clock.now());
      await this.events.record(userId, { event: 'sessions.revoked', actor: { kind: 'user' }, ip });
    });
  }

  async setActiveStore(userId: string, sessionId: string, storeId: string): Promise<void> {
    if (!(await this.team.accessFor(storeId, userId))) throw sessionError('STORE_NOT_FOUND');
    if (!(await this.repository.setActiveStore(userId, sessionId, storeId, this.clock.now())))
      throw new AppError('AUTH_REQUIRED', PLATFORM_ERRORS.AUTH_REQUIRED);
  }

  private async revokeSessions(userId: string, sessionId: string, others: boolean): Promise<void> {
    await this.transaction.run(userId, async () => {
      const changed = await this.repository.revoke(userId, sessionId, this.clock.now(), others);
      if (changed)
        await this.events.record(userId, {
          event: 'sessions.revoked',
          actor: { kind: 'user' },
          details: { sessionId },
        });
    });
  }
}

function hash(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}
function lifetimeMilliseconds(isRemembered: boolean): number {
  return (isRemembered ? 30 * 24 : 12) * 60 * 60 * 1000;
}
