import { Inject, Injectable } from '@nestjs/common';

import { SignInCodesService, type SignInSubject } from '../auth/sign-in-codes.service';
import { UsersService } from '../auth/users.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { MINUTE_MS } from '../platform/time';
import { TeamService } from '../team/team.service';
import { StaffIdentityService } from './staff-identity.service';
import { SupportAuditService } from './support-audit.service';
import { supportGrantResponse, supportGrantStatus } from './support-grant';
import { assertSupportStaff } from './support-staff-checks';
import { supportError } from './support.errors';
import { SupportRepository } from './support.repository';

type SupportCodeRequest = { id: string; userId: string; sessionId: string; ip: string };

type StaffCodeRequest = { id: string; userId: string; ip: string };

type SupportApproval = { id: string; userId: string; sessionId: string; code: string; ip: string };

type SupportEnd = {
  id: string;
  userId: string;
  sessionId: string;
  decision: 'denied' | 'ended';
  ip: string;
};

@Injectable()
export class SupportOwnerService {
  constructor(
    @Inject(SupportRepository) private readonly repository: SupportRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StaffIdentityService) private readonly identities: StaffIdentityService,
    @Inject(SupportAuditService) private readonly audit: SupportAuditService,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(SignInCodesService) private readonly codes: SignInCodesService,
  ) {}

  async ownerRequests(storeId: string, userId: string, sessionId: string, before?: string) {
    return this.transaction.run(storeId, async () => {
      await this.assertOwner(storeId, userId, (now) =>
        this.repository.readOwnerSession(storeId, userId, sessionId, now),
      );
      const items = (await this.repository.list(storeId, before)).map((grant) =>
        supportGrantResponse(grant, this.clock.now()),
      );
      return { items, nextCursor: items.length === 50 ? items.at(-1)!.id : null };
    });
  }

  async requestCode(storeId: string, { id, userId, sessionId, ip }: SupportCodeRequest) {
    const { subject } = await this.lockSubject(storeId, id, userId, () =>
      this.assertOwnerSession(storeId, userId, sessionId),
    );
    await this.codes.send({ subject, purpose: 'support_approval', ip });
  }

  async sendRequestCode(storeId: string, { id, userId, ip }: StaffCodeRequest) {
    const { subject } = await this.lockSubject(storeId, id, userId, async () => {
      if ((await this.repository.owner(storeId)) !== userId) throw supportError('SUPPORT_DENIED');
    });
    await this.codes.send({ subject, purpose: 'support_approval', ip });
  }

  private lockSubject(
    storeId: string,
    id: string,
    userId: string,
    assertRequester: () => Promise<void>,
  ) {
    return this.transaction.run(storeId, async () => {
      const identity = await this.users.lockVerifiedIdentity(storeId, userId);
      return this.transaction.runLocked(storeId, async () => {
        await assertRequester();
        const grant = await this.pending(storeId, id);
        if (!identity?.phone || !identity.phoneVerifiedAt)
          throw supportError('SUPPORT_PHONE_REQUIRED');
        const subject = {
          userId,
          target: identity.phone,
          phone: identity.phone,
          binding: JSON.stringify([
            storeId,
            id,
            userId,
            identity.phone,
            identity.phoneVerifiedAt.toISOString(),
            grant.access,
            grant.scopes,
            grant.durationMinutes,
          ]),
        } satisfies SignInSubject;
        return { subject, grant };
      });
    });
  }

  async approve(storeId: string, { id, userId, sessionId, code, ip }: SupportApproval) {
    await this.transaction.run(storeId, async () => {
      const { subject, grant: requested } = await this.lockSubject(storeId, id, userId, () =>
        this.assertOwnerSession(storeId, userId, sessionId),
      );
      const proof = await this.codes.consume(subject, 'support_approval', code, ip);
      if (proof.userId !== userId) throw supportError('SUPPORT_DENIED');
      await assertSupportStaff(await this.repository.staff(storeId, requested.staffUserId), {
        storeId,
        clock: this.clock,
        identities: this.identities,
      });
      // Disable can end the request while this action waits for the staff lock.
      const grant = await this.pending(storeId, id);
      const now = this.clock.now();
      const expiresAt = new Date(now.getTime() + grant.durationMinutes * MINUTE_MS);
      await this.audit.record(storeId, {
        id,
        actor: { kind: 'user', userId },
        action: 'support.approved',
        reason: 'Owner approved support access',
        ip,
        details: {
          before: { status: 'requested' },
          after: { status: 'approved', expiresAt: expiresAt.toISOString() },
        },
      });
      await this.repository.change(storeId, id, {
        status: 'approved',
        approvedByUserId: userId,
        approvedAt: now,
        expiresAt,
      });
    });
  }

  async end(storeId: string, { id, userId, sessionId, decision, ip }: SupportEnd) {
    await this.ownerAction(storeId, userId, sessionId, async () => {
      const grant = await this.requireGrant(storeId, id);
      if (
        decision === 'denied'
          ? supportGrantStatus(grant, this.clock.now()) !== 'requested'
          : supportGrantStatus(grant, this.clock.now()) !== 'approved'
      )
        throw supportError('SUPPORT_INVALID');
      await this.audit.record(storeId, {
        id,
        actor: { kind: 'user', userId },
        action: `support.${decision}`,
        reason: `Owner ${decision} support access`,
        ip,
        details: { before: { status: grant.status }, after: { status: decision } },
      });
      await this.repository.change(storeId, id, { status: decision, endedAt: this.clock.now() });
    });
  }

  private ownerAction<T>(
    storeId: string,
    userId: string,
    sessionId: string,
    work: () => Promise<T>,
  ) {
    return this.transaction.run(storeId, async () => {
      await this.users.lockVerifiedIdentity(storeId, userId);
      return this.transaction.runLocked(storeId, async () => {
        await this.assertOwnerSession(storeId, userId, sessionId);
        return work();
      });
    });
  }

  private assertOwnerSession(storeId: string, userId: string, sessionId: string) {
    return this.assertOwner(storeId, userId, (now) =>
      this.repository.ownerSession(storeId, userId, sessionId, now),
    );
  }

  private async assertOwner(
    storeId: string,
    userId: string,
    findSession: (now: Date) => Promise<boolean>,
  ) {
    const access = await this.team.accessFor(storeId, userId);
    if (!access || !this.team.canApproveSupport(access) || !(await findSession(this.clock.now())))
      throw supportError('SUPPORT_DENIED');
  }

  private async requireGrant(storeId: string, id: string) {
    const grant = await this.repository.find(storeId, id);
    if (!grant) throw supportError('SUPPORT_NOT_FOUND');
    return grant;
  }

  private async pending(storeId: string, id: string) {
    const grant = await this.requireGrant(storeId, id);
    if (supportGrantStatus(grant, this.clock.now()) !== 'requested')
      throw supportError('SUPPORT_INVALID');
    return grant;
  }
}
