import { Inject, Injectable } from '@nestjs/common';
import { newId } from '../platform/database/new-id';
import type { AccessIdentity } from '@dakly/providers/cloudflare/access-driver';
import type { StaffIdentity } from '@dakly/contracts/staff-auth';
import { StaffTransaction } from '../platform/database/staff-transaction';
import { Clock } from '../platform/clock';
import { StaffRepository } from './staff.repository';
import { StaffTokens, staffTokenHash } from './staff-tokens';
import { staffError } from './admin.errors';
import { StaffAuditService } from './staff-audit.service';

@Injectable()
export class StaffSessionsService {
  constructor(
    @Inject(StaffRepository) private readonly repository: StaffRepository,
    @Inject(StaffTransaction) private readonly transaction: StaffTransaction,
    @Inject(StaffTokens) private readonly tokens: StaffTokens,
    @Inject(StaffAuditService) private readonly audit: StaffAuditService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}
  async issue(staff: StaffIdentity, ip: string): Promise<string> {
    const now = this.clock.now();
    const id = newId();
    const token = await this.tokens.issue(staff, id, now);
    await this.audit.record(staff.id, 'staff.signed_in', ip);
    await this.repository.revokeSessions(staff.id, now);
    await this.repository.consumeAll(staff.id, now);
    await this.repository.createSession(staff.id, {
      id,
      tokenHash: staffTokenHash(token),
      ip,
      lastSeenAt: now,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 28800000),
    });
    await this.repository.update(staff.id, {
      lastSignInAt: now,
      failedAttempts: 0,
      blockedUntil: null,
    });
    return token;
  }
  async resolve(
    token: string | undefined,
    identity: AccessIdentity,
  ): Promise<StaffIdentity & { sessionId: string }> {
    const claims = token ? await this.tokens.verify(token, this.clock.now()) : undefined;
    if (!claims || !token) throw staffError('STAFF_AUTH_REQUIRED');
    return this.transaction.run(claims.staffUserId, async () => {
      const staff = await this.repository.lock(claims.staffUserId);
      if (
        !staff ||
        staff.status !== 'active' ||
        !staff.enrolledAt ||
        staff.accessSubject !== identity.subject ||
        staff.email.toLowerCase() !== identity.email
      )
        throw staffError('STAFF_AUTH_REQUIRED');
      const session = await this.repository.session(
        staff.id,
        claims.sessionId,
        staffTokenHash(token),
      );
      const now = this.clock.now();
      if (!session || !this.isCurrent(session, now)) throw staffError('STAFF_AUTH_REQUIRED');
      await this.repository.touchSession(staff.id, session.id, now);
      return { id: staff.id, name: staff.name, role: staff.role, sessionId: session.id };
    });
  }
  private isCurrent(
    session: { revokedAt: Date | null; expiresAt: Date; lastSeenAt: Date | null },
    now: Date,
  ): boolean {
    return (
      !session.revokedAt &&
      session.expiresAt > now &&
      Boolean(session.lastSeenAt && session.lastSeenAt.getTime() + 1800000 > now.getTime())
    );
  }
  async signOut(staffUserId: string, ip: string): Promise<void> {
    await this.transaction.run(staffUserId, async () => {
      await this.repository.lock(staffUserId);
      await this.audit.record(staffUserId, 'staff.signed_out', ip);
      await this.repository.revokeSessions(staffUserId, this.clock.now());
      await this.repository.consumeAll(staffUserId, this.clock.now());
    });
  }
}
