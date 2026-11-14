import { randomBytes, createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CreateCustomerInput } from '@dakly/contracts/customers';
import type {
  SupportPrincipal,
  SupportRequestInput,
  SupportGrantResponse,
} from '@dakly/contracts/support';
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
import { supportError } from './support.errors';

const requestRoles = ['super_admin', 'support', 'trust_safety'];
const tokenHash = (token: string) => createHash('sha256').update(token).digest();
type Staff = StaffIdentity & { sessionId: string };
type Grant = NonNullable<Awaited<ReturnType<SupportRepository['find']>>>;
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
  ) {}
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
    } catch {
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
    return this.ownerAction(storeId, userId, sessionId, async () => {
      const items = (await this.repository.list(storeId, before)).map((grant) =>
        this.response(grant),
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
          ? this.status(grant) !== 'requested'
          : this.status(grant) !== 'approved'
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
        'Staff opened approved support session',
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
        'Staff entered approved support session',
        ip,
      );
      await this.repository.consume(storeId, hash, tokenHash(token), this.clock.now());
      return token;
    });
  }
  async session(token: string | undefined) {
    return this.run(token, async (principal) => ({
      ...this.response(await this.authorize(principal)),
      storeName: await this.repository.storeName(principal.storeId),
    }));
  }
  async customer(token: string | undefined, id: string, ip: string) {
    return this.run(token, async (principal) => {
      const grant = await this.authorize(principal);
      if (!grant.scopes.includes('customers')) return this.denied(principal, ip);
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
      return result;
    });
  }
  async createCustomer(token: string | undefined, input: CreateCustomerInput, ip: string) {
    return this.run(token, async (principal) => {
      const grant = await this.authorize(principal);
      if (grant.access !== 'write' || !grant.scopes.includes('customers'))
        return this.denied(principal, ip);
      const result = await this.customers.create(principal.storeId, input, { seeFullPhone: true });
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
      return result;
    });
  }
  private async recordActivity(principal: SupportPrincipal) {
    if (!(await this.repository.touchParent(principal.storeId, principal, this.clock.now())))
      throw supportError('SUPPORT_ENDED');
  }
  private async run<T>(
    token: string | undefined,
    work: (principal: SupportPrincipal) => Promise<T>,
  ) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw supportError('SUPPORT_ENDED');
    const hash = tokenHash(token);
    const storeId = await this.repository.locate(hash, false);
    if (!storeId) throw supportError('SUPPORT_ENDED');
    const result = await this.transaction.runLocked(storeId, async () => {
      const session = await this.repository.session(storeId, hash, false);
      if (!session) throw supportError('SUPPORT_ENDED');
      return work(session);
    });
    // Denial audit must commit before sending the permission error.
    if (result === null) throw supportError('SUPPORT_DENIED');
    return result;
  }
  private async denied(principal: SupportPrincipal, ip: string) {
    await this.audit.record(
      principal.storeId,
      principal.grantId,
      { kind: 'staff', staffUserId: principal.staffUserId },
      'support.action_denied',
      'Support scope denied the requested action',
      ip,
    );
    return null;
  }
  private async authorize(principal: SupportPrincipal) {
    await this.assertStaff(principal.storeId, principal.staffUserId, principal.staffSessionId);
    const grant = await this.requireGrant(principal.storeId, principal.grantId);
    if (grant.staffUserId !== principal.staffUserId || this.status(grant) !== 'approved')
      throw supportError('SUPPORT_ENDED');
    return grant;
  }
  private async assertStaff(storeId: string, staffUserId: string, sessionId?: string) {
    const staff = await this.repository.staff(storeId, staffUserId);
    if (
      !staff ||
      staff.status !== 'active' ||
      !staff.enrolledAt ||
      !requestRoles.includes(staff.role)
    )
      throw supportError('SUPPORT_ENDED');
    if (sessionId) await this.assertParent(storeId, staffUserId, sessionId);
    if (await this.identities.conflictsWithStore(storeId, staffUserId))
      throw supportError('SUPPORT_DENIED');
  }
  private async assertParent(storeId: string, staffUserId: string, sessionId: string) {
    const parent = await this.repository.parent(storeId, staffUserId, sessionId);
    const now = this.clock.now();
    if (
      !parent ||
      parent.revokedAt ||
      parent.expiresAt <= now ||
      !parent.lastSeenAt ||
      parent.lastSeenAt.getTime() + 1800000 <= now.getTime()
    )
      throw supportError('SUPPORT_ENDED');
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
    if (this.status(grant) !== 'requested') throw supportError('SUPPORT_INVALID');
    return grant;
  }
  private status(grant: Grant) {
    const now = this.clock.now();
    return (grant.status === 'requested' &&
      grant.requestedAt.getTime() + 1800000 <= now.getTime()) ||
      (grant.status === 'approved' && (!grant.expiresAt || grant.expiresAt <= now))
      ? 'expired'
      : grant.status;
  }
  private response(grant: Grant): SupportGrantResponse {
    return {
      id: grant.id,
      staffName: grant.staffName,
      scopes: grant.scopes,
      access: grant.access,
      status: this.status(grant),
      reason: grant.reason,
      durationMinutes: grant.durationMinutes,
      requestedAt: grant.requestedAt.toISOString(),
      expiresAt: grant.expiresAt?.toISOString() ?? null,
    };
  }
}
