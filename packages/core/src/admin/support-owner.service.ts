import { Inject, Injectable } from '@nestjs/common';

import { SignInCodes, type SignInSubject } from '../auth/codes.module';
import { UsersService } from '../auth/users.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TeamService } from '../team/team.service';
import { StaffIdentityService } from './staff-identity.service';
import { SupportAuditService } from './support-audit.service';
import { supportGrantResponse, supportGrantStatus } from './support-grant';
import { supportRoles } from './support-roles';
import { supportError } from './support.errors';
import { SupportRepository } from './support.repository';

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
    @Inject(SignInCodes) private readonly codes: SignInCodes,
  ) {}
  async ownerRequests(storeId: string, userId: string, sessionId: string, before?: string) {
    return this.transaction.run(storeId, async () => {
      await this.assertOwnerCanRead(storeId, userId, sessionId);
      const items = (await this.repository.list(storeId, before)).map((grant) =>
        supportGrantResponse(grant, this.clock.now()),
      );
      return { items, nextCursor: items.length === 50 ? items.at(-1)!.id : null };
    });
  }
  async requestCode(
    storeId: string,
    id: string,
    userId: string,
    sessionId: string | undefined,
    ip: string,
  ) {
    const subject = await this.requestSubject(storeId, id, userId, sessionId);
    await this.codes.send(subject, 'support_approval', ip);
  }
  private async requestSubject(storeId: string, id: string, userId: string, sessionId?: string) {
    return this.transaction.run(storeId, async () => {
      const identity = await this.users.lockVerifiedIdentity(storeId, userId);
      return this.transaction.runLocked(storeId, async () => {
        if (sessionId) await this.assertOwner(storeId, userId, sessionId);
        else if ((await this.repository.owner(storeId)) !== userId)
          throw supportError('SUPPORT_DENIED');
        const grant = await this.pending(storeId, id);
        if (!identity?.phone || !identity.phoneVerifiedAt)
          throw supportError('SUPPORT_PHONE_REQUIRED');
        return {
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
      });
    });
  }
  async approve(
    storeId: string,
    id: string,
    userId: string,
    sessionId: string,
    code: string,
    ip: string,
  ) {
    const subject = await this.requestSubject(storeId, id, userId, sessionId);
    const proof = await this.codes.consume(subject, 'support_approval', code, ip);
    if (proof.userId !== userId) throw supportError('SUPPORT_DENIED');
    return this.transaction.run(storeId, async () => {
      const current = await this.requestSubject(storeId, id, userId, sessionId);
      if (current.binding !== subject.binding) throw supportError('SUPPORT_DENIED');
      const requested = await this.pending(storeId, id);
      await this.assertStaff(storeId, requested.staffUserId);
      // Disable can end the request while this action waits for the staff lock.
      const grant = await this.pending(storeId, id);
      const now = this.clock.now();
      const expiresAt = new Date(now.getTime() + grant.durationMinutes * 60000);
      await this.audit.record(
        storeId,
        id,
        { kind: 'user', userId },
        'support.approved',
        'Owner approved support access',
        ip,
        {
          before: { status: 'requested' },
          after: { status: 'approved', expiresAt: expiresAt.toISOString() },
        },
      );
      await this.repository.change(storeId, id, {
        status: 'approved',
        approvedByUserId: userId,
        approvedAt: now,
        expiresAt,
      });
    });
  }
  async end(
    storeId: string,
    id: string,
    userId: string,
    sessionId: string,
    decision: 'denied' | 'ended',
    ip: string,
  ) {
    await this.ownerAction(storeId, userId, sessionId, async () => {
      const grant = await this.requireGrant(storeId, id);
      if (
        decision === 'denied'
          ? supportGrantStatus(grant, this.clock.now()) !== 'requested'
          : supportGrantStatus(grant, this.clock.now()) !== 'approved'
      )
        throw supportError('SUPPORT_INVALID');
      await this.audit.record(
        storeId,
        id,
        { kind: 'user', userId },
        `support.${decision}`,
        `Owner ${decision} support access`,
        ip,
        { before: { status: grant.status }, after: { status: decision } },
      );
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
        await this.assertOwner(storeId, userId, sessionId);
        return work();
      });
    });
  }
  private async assertOwner(storeId: string, userId: string, sessionId: string) {
    const access = await this.team.accessFor(storeId, userId);
    if (
      !access ||
      !this.team.canApproveSupport(access) ||
      !(await this.repository.ownerSession(storeId, userId, sessionId, this.clock.now()))
    )
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
  private async assertOwnerCanRead(storeId: string, userId: string, sessionId: string) {
    const access = await this.team.accessFor(storeId, userId);
    if (
      !access ||
      !this.team.canApproveSupport(access) ||
      !(await this.repository.readOwnerSession(storeId, userId, sessionId, this.clock.now()))
    )
      throw supportError('SUPPORT_DENIED');
  }
  private async assertStaff(storeId: string, staffUserId: string) {
    const staff = await this.repository.staff(storeId, staffUserId);
    if (
      !staff ||
      staff.status !== 'active' ||
      !staff.enrolledAt ||
      !supportRoles.includes(staff.role)
    )
      throw supportError('SUPPORT_ENDED');
    if (await this.identities.conflictsWithStore(storeId, staffUserId))
      throw supportError('SUPPORT_DENIED');
    return staff;
  }
}
