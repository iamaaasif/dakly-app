import { randomBytes, createHash } from 'node:crypto';

import { Inject, Injectable, Optional } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import type { CreateCustomerInput } from '@dakly/contracts/customers';
import type { StaffIdentity } from '@dakly/contracts/staff-auth';
import type { SupportPrincipal, SupportRequestInput } from '@dakly/contracts/support';

import { CustomersService } from '../customers/customers.service';
import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { bindVerifiedStore } from '../platform/logging/request-logging';
import { StaffIdentityService } from './staff-identity.service';
import { SupportAuditService } from './support-audit.service';
import { supportGrantResponse, supportGrantStatus } from './support-grant';
import { SupportOwnerService } from './support-owner.service';
import { supportRoles } from './support-roles';
import { supportContextTag, assertSupportContext, assertSupportParent } from './support-session';
import { supportError, isSupportCodeUnavailable } from './support.errors';
import { SupportRepository } from './support.repository';

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
    @Inject(SupportOwnerService) private readonly owner: SupportOwnerService,
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
    if (!supportRoles.includes(staff.role)) throw supportError('SUPPORT_DENIED');
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
      await this.owner.requestCode(target.id, id, ownerId, undefined, ip);
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
    const storeId = await this.repository.locateHandoff(hash);
    if (!storeId) throw supportError('SUPPORT_ENDED');
    return this.transaction.runLocked(storeId, async () => {
      const session = await this.repository.handoffSession(storeId, hash);
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
    return this.readSession(token, async (principal, contextTag) => {
      const staff = await this.assertCurrentStaff(
        principal.storeId,
        principal.staffUserId,
        principal.staffSessionId,
      );
      const grant = await this.authorizeGrant(principal, staff);
      return {
        ...supportGrantResponse(grant, this.clock.now()),
        storeName: await this.repository.storeName(principal.storeId),
        contextTag,
      };
    });
  }

  async customer(
    token: string | undefined,
    id: string,
    ip: string,
    expectedContext?: string | string[],
  ) {
    return this.run(token, async (principal, contextTag) => {
      const grant = await this.authorize(principal);
      assertSupportContext(expectedContext, contextTag);
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
      return { ...result, contextTag };
    });
  }

  async createCustomer(
    token: string | undefined,
    input: CreateCustomerInput,
    ip: string,
    expectedContext?: string | string[],
  ) {
    return this.run(token, async (principal, contextTag) => {
      const grant = await this.authorize(principal);
      assertSupportContext(expectedContext, contextTag);
      if (grant.isBreakGlass || grant.access !== 'write' || !grant.scopes.includes('customers'))
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
      return { ...result, contextTag };
    });
  }

  private async recordActivity(principal: SupportPrincipal) {
    if (!(await this.repository.touchParent(principal.storeId, principal, this.clock.now())))
      throw supportError('SUPPORT_ENDED');
  }

  private async run<T>(
    token: string | undefined,
    work: (principal: SupportPrincipal, contextTag: string) => Promise<T>,
  ) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw supportError('SUPPORT_ENDED');
    const hash = tokenHash(token);
    const storeId = await this.repository.locateSession(hash);
    if (!storeId) throw supportError('SUPPORT_ENDED');
    const result = await this.transaction.runLocked(storeId, async () => {
      const session = await this.repository.session(storeId, hash);
      if (!session) throw supportError('SUPPORT_ENDED');
      return work(session, supportContextTag(hash));
    });
    // Denial audit must commit before sending the permission error.
    if (result === null) throw supportError('SUPPORT_DENIED');
    return result;
  }

  private async readSession<T>(
    token: string | undefined,
    work: (principal: SupportPrincipal, contextTag: string) => Promise<T>,
  ) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw supportError('SUPPORT_ENDED');
    const hash = tokenHash(token);
    const storeId = await this.repository.locateSession(hash);
    if (!storeId) throw supportError('SUPPORT_ENDED');
    return this.transaction.run(storeId, async () => {
      const session = await this.repository.readSession(storeId, hash);
      if (!session) throw supportError('SUPPORT_ENDED');
      return work(session, supportContextTag(hash));
    });
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
    const staff = await this.assertStaff(
      principal.storeId,
      principal.staffUserId,
      principal.staffSessionId,
    );
    return this.authorizeGrant(principal, staff);
  }

  private async authorizeGrant(principal: SupportPrincipal, staff: StaffIdentity) {
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

  private async assertStaff(storeId: string, staffUserId: string, sessionId?: string) {
    const staff = await this.repository.staff(storeId, staffUserId);
    if (
      !staff ||
      staff.status !== 'active' ||
      !staff.enrolledAt ||
      !supportRoles.includes(staff.role)
    )
      throw supportError('SUPPORT_ENDED');
    if (sessionId) await this.assertParent(storeId, staffUserId, sessionId);
    if (await this.identities.conflictsWithStore(storeId, staffUserId))
      throw supportError('SUPPORT_DENIED');
    return staff;
  }

  private async assertParent(storeId: string, staffUserId: string, sessionId: string) {
    assertSupportParent(
      await this.repository.parent(storeId, staffUserId, sessionId),
      this.clock.now(),
    );
  }

  private async assertCurrentStaff(storeId: string, staffUserId: string, sessionId: string) {
    const staff = await this.repository.readStaff(storeId, staffUserId);
    if (
      !staff ||
      staff.status !== 'active' ||
      !staff.enrolledAt ||
      !supportRoles.includes(staff.role)
    )
      throw supportError('SUPPORT_ENDED');
    assertSupportParent(
      await this.repository.readParent(storeId, staffUserId, sessionId),
      this.clock.now(),
    );
    if (await this.identities.conflictsWithStore(storeId, staffUserId))
      throw supportError('SUPPORT_DENIED');
    return staff;
  }

  private assertRole(staff: Staff) {
    if (!supportRoles.includes(staff.role)) throw supportError('SUPPORT_DENIED');
  }

  private async requireGrant(storeId: string, id: string) {
    const grant = await this.repository.find(storeId, id);
    if (!grant) throw supportError('SUPPORT_NOT_FOUND');
    return grant;
  }
}
