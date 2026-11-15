import {
  denySupportAction,
  runSupportSession,
  assertSupportContext,
  assertSupportStaff,
} from './support-session';
import { bindVerifiedStore } from '../platform/logging/request-logging';
import { supportGrantResponse, supportGrantStatus } from './support-grant';
import { randomBytes, createHash } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { CreateCustomerInput } from '@dakly/contracts/customers';
import type { SupportPrincipal, SupportRequestInput } from '@dakly/contracts/support';
import type { StaffIdentity } from '@dakly/contracts/staff-auth';
import { StoreTransaction } from '../platform/database/store-transaction';
import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { SignInCodes, type SignInSubject } from '../auth/codes.module';
import { UsersService } from '../auth/users.service';
import { TeamService } from '../team/team.service';
import { SupportAuditService } from './support-audit.service';
import { CustomersService } from '../customers/customers.service';
import { SupportRepository } from './support.repository';
import { StaffIdentityService } from './staff-identity.service';
import { supportError, isSupportCodeUnavailable } from './support.errors';

const requestRoles = ['super_admin', 'support', 'trust_safety'];
const tokenHash = (token: string) => createHash('sha256').update(token).digest();
type Staff = StaffIdentity & { sessionId: string };
@Injectable()
export class SupportService {
  constructor(
    @Inject(SupportRepository) private readonly repository: SupportRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StaffIdentityService) private readonly identities: StaffIdentityService,
    @Inject(SupportAuditService) private readonly audit: SupportAuditService,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(SignInCodes) private readonly codes: SignInCodes,
    @Inject(CustomersService) private readonly customers: CustomersService,
    @Optional() @Inject(PinoLogger) private readonly logger?: PinoLogger,
  ) {}
  async authorizeBreakGlass(storeId: string, staff: Staff) {
    const current = await this.assertStaff(storeId, staff.id, staff.sessionId);
    if (current.role !== 'super_admin') throw supportError('SUPPORT_DENIED');
  }
  targets(staff: Staff, query: string) {
    this.assertRole(staff);
    return this.repository.targets(query);
  }
  async request(staff: Staff, input: SupportRequestInput, ip: string) {
    if (!requestRoles.includes(staff.role)) throw supportError('SUPPORT_DENIED');
    const target = (await this.repository.targets(input.targetId))[0];
    if (!target) throw supportError('SUPPORT_NOT_FOUND');
    const id = newId();
    const ownerId = await this.transaction.runLocked(target.id, async () => {
      await this.assertStaff(target.id, staff.id, staff.sessionId);
      const ownerId = await this.repository.owner(target.id);
      if (!ownerId) throw supportError('SUPPORT_INVALID');
      await this.audit.record(
        target.id,
        id,
        { kind: 'staff', staffUserId: staff.id },
        'support.requested',
        input.reason,
        ip,
        { scopes: input.scopes, access: input.access, durationMinutes: input.durationMinutes },
      );
      await this.repository.insert(target.id, id, staff.id, input, this.clock.now());
      return ownerId;
    });
    try {
      const subject = await this.requestSubject(target.id, id, ownerId);
      await this.codes.send(subject, 'support_approval', ip);
      return { id, codeSent: true };
    } catch (error) {
      if (!isSupportCodeUnavailable(error)) throw error;
      // Consent is still pending; the Owner can resend after delivery or cooldown recovers.
      return { id, codeSent: false };
    }
  }
  async requested(staff: Staff, before?: string) {
    this.assertRole(staff);
    const items = await this.repository.staffGrants(staff.id, before);
    return { items, nextCursor: items.length === 50 ? items.at(-1)!.id : null };
  }
  async ownerRequests(storeId: string, userId: string, sessionId: string, before?: string) {
    return this.transaction.run(storeId, async () => {
      await this.assertOwner(storeId, userId, sessionId, true);
      const items = (await this.repository.list(storeId, before)).map((grant) =>
        supportGrantResponse(grant, this.clock.now()),
      );
      return { items, nextCursor: items.length === 50 ? items.at(-1)!.id : null };
    });
  }
  async requestCode(storeId: string, id: string, userId: string, sessionId: string, ip: string) {
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
  async issueHandoff(staff: Staff, id: string, ip: string) {
    const target = await this.repository.grantStore(staff.id, id);
    if (!target) throw supportError('SUPPORT_NOT_FOUND');
    return this.transaction.runLocked(target.store_id, async () => {
      const principal = {
        storeId: target.store_id,
        grantId: id,
        staffUserId: staff.id,
        staffSessionId: staff.sessionId,
      };
      await this.authorize(principal);
      const token = randomBytes(32).toString('base64url');
      await this.audit.record(
        principal.storeId,
        id,
        { kind: 'staff', staffUserId: staff.id },
        'support.handoff_issued',
        'Staff opened authorized support session',
        ip,
      );
      await this.repository.handoff(
        principal.storeId,
        principal,
        tokenHash(token),
        new Date(this.clock.now().getTime() + 60000),
      );
      return { token };
    });
  }
  async exchange(token: string, ip: string) {
    const hash = tokenHash(token);
    const storeId = await this.repository.locate(hash, true);
    if (!storeId) throw supportError('SUPPORT_ENDED');
    return this.transaction.runLocked(storeId, async () => {
      const session = await this.repository.session(storeId, hash, true);
      if (!session || session.consumedAt || session.handoffExpiresAt <= this.clock.now())
        throw supportError('SUPPORT_ENDED');
      await this.authorize(session);
      const token = randomBytes(32).toString('base64url');
      await this.audit.record(
        storeId,
        session.grantId,
        { kind: 'staff', staffUserId: session.staffUserId },
        'support.session_started',
        'Staff entered authorized support session',
        ip,
      );
      await this.repository.consume(storeId, hash, tokenHash(token), this.clock.now());
      return token;
    });
  }
  async session(token: string | undefined) {
    return runSupportSession(
      this.repository,
      this.transaction,
      token,
      async (principal, contextTag) => ({
        ...supportGrantResponse(await this.authorize(principal, true), this.clock.now()),
        storeName: await this.repository.storeName(principal.storeId),
        contextTag,
      }),
      true,
    );
  }
  async customer(
    token: string | undefined,
    id: string,
    ip: string,
    expectedContext?: string | string[],
  ) {
    return runSupportSession(
      this.repository,
      this.transaction,
      token,
      async (principal, contextTag) => {
        const grant = await this.authorize(principal, true);
        assertSupportContext(expectedContext, contextTag);
        if (!grant.scopes.includes('customers'))
          return denySupportAction(this.audit, principal, ip);
        const result = await this.customers.getById(principal.storeId, id, { seeFullPhone: true });
        await this.audit.record(
          principal.storeId,
          id,
          { kind: 'staff', staffUserId: principal.staffUserId },
          'support.customer_read',
          grant.reason,
          ip,
          { grantId: grant.id },
          'customer',
        );
        await this.recordActivity(principal);
        return { ...result, contextTag };
      },
      true,
    );
  }
  async createCustomer(
    token: string | undefined,
    input: CreateCustomerInput,
    ip: string,
    expectedContext?: string | string[],
  ) {
    return runSupportSession(
      this.repository,
      this.transaction,
      token,
      async (principal, contextTag) => {
        const grant = await this.authorize(principal);
        assertSupportContext(expectedContext, contextTag);
        if (grant.isBreakGlass || grant.access !== 'write' || !grant.scopes.includes('customers'))
          return denySupportAction(this.audit, principal, ip);
        const result = await this.customers.create(principal.storeId, input, {
          seeFullPhone: true,
        });
        await this.audit.record(
          principal.storeId,
          result.id,
          { kind: 'staff', staffUserId: principal.staffUserId },
          'support.customer_created',
          grant.reason,
          ip,
          { grantId: grant.id },
          'customer',
        );
        await this.recordActivity(principal);
        return { ...result, contextTag };
      },
    );
  }
  private async recordActivity(principal: SupportPrincipal) {
    if (!(await this.repository.touchParent(principal.storeId, principal, this.clock.now())))
      throw supportError('SUPPORT_ENDED');
  }
  private async authorize(principal: SupportPrincipal, readOnly = false) {
    const staff = await this.assertStaff(
      principal.storeId,
      principal.staffUserId,
      principal.staffSessionId,
      readOnly,
    );
    const grant = await this.requireGrant(principal.storeId, principal.grantId);
    if (
      (grant.isBreakGlass && (staff.role !== 'super_admin' || grant.access !== 'read')) ||
      grant.staffUserId !== principal.staffUserId ||
      supportGrantStatus(grant, this.clock.now()) !== 'approved'
    )
      throw supportError('SUPPORT_ENDED');
    bindVerifiedStore(this.logger, principal.storeId);
    return grant;
  }
  private async assertStaff(
    storeId: string,
    staffUserId: string,
    sessionId?: string,
    readOnly = false,
  ) {
    return assertSupportStaff(
      this.repository,
      this.identities,
      storeId,
      staffUserId,
      sessionId,
      this.clock,
      readOnly,
    );
  }
  private assertRole(staff: Staff) {
    if (!requestRoles.includes(staff.role)) throw supportError('SUPPORT_DENIED');
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
  private async assertOwner(storeId: string, userId: string, sessionId: string, readOnly = false) {
    const access = await this.team.accessFor(storeId, userId);
    if (
      !access ||
      !this.team.canApproveSupport(access) ||
      !(readOnly
        ? await this.repository.readOwnerSession(storeId, userId, sessionId, this.clock.now())
        : await this.repository.ownerSession(storeId, userId, sessionId, this.clock.now()))
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
}
