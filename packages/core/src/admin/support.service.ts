import { randomBytes } from 'node:crypto';

import { Inject, Injectable, Optional } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import type { CreateContactInput } from '@dakly/contracts/contacts';
import type { StaffIdentity } from '@dakly/contracts/staff-auth';
import type { SupportPrincipal, SupportRequestInput } from '@dakly/contracts/support';

import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { hashToken } from '../platform/crypto/token-hash';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { bindVerifiedStore } from '../platform/logging/request-logging';
import { MINUTE_MS } from '../platform/time';
import { StaffIdentityService } from './staff-identity.service';
import { SupportAuditService } from './support-audit.service';
import { supportGrantResponse, supportGrantStatus } from './support-grant';
import { SupportOwnerService } from './support-owner.service';
import { supportRoles, walletCreditRoles } from './support-roles';
import { supportContextTag, assertSupportContext } from './support-session';
import { assertSupportStaff } from './support-staff-checks';
import { supportError, isSupportCodeUnavailable } from './support.errors';
import { SupportRepository } from './support.repository';

const SUPPORT_HANDOFF_TTL_MS = MINUTE_MS;
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
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Optional() @Inject(PinoLogger) private readonly logger?: PinoLogger,
  ) {}

  async authorizeBreakGlass(storeId: string, staff: Staff) {
    const current = await this.lockStaff(storeId, staff.id, staff.sessionId);
    if (current.role !== 'super_admin') throw supportError('SUPPORT_DENIED');
  }

  async authorizeWalletCredit(storeId: string, staff: Staff) {
    const current = await this.lockStaff(storeId, staff.id, staff.sessionId);
    if (!walletCreditRoles.includes(current.role)) throw supportError('SUPPORT_DENIED');
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
      await this.lockStaff(target.id, staff.id, staff.sessionId);
      const ownerId = await this.repository.owner(target.id);
      if (!ownerId) throw supportError('SUPPORT_INVALID');
      await this.audit.record(target.id, {
        id,
        actor: { kind: 'staff', staffUserId: staff.id },
        action: 'support.requested',
        reason: input.reason,
        ip,
        details: {
          scopes: input.scopes,
          access: input.access,
          durationMinutes: input.durationMinutes,
        },
      });
      await this.repository.insert(target.id, {
        id,
        staffUserId: staff.id,
        input,
        now: this.clock.now(),
      });
      return ownerId;
    });
    try {
      await this.owner.sendRequestCode(target.id, { id, userId: ownerId, ip });
      return { id, codeSent: true };
    } catch (error) {
      if (!isSupportCodeUnavailable(error)) throw error;
      // Consent is still pending; the Owner can resend after delivery or cooldown recovers.
      return { id, codeSent: false };
    }
  }

  async requested(staff: Staff, before?: string) {
    this.assertRole(staff);
    const rows = await this.repository.staffGrants(staff.id, before);
    return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49]!.id : null };
  }

  async issueHandoff(staff: Staff, id: string, ip: string) {
    const storeId = await this.repository.grantStore(staff.id, id);
    if (!storeId) throw supportError('SUPPORT_NOT_FOUND');
    return this.transaction.runLocked(storeId, async () => {
      const principal = {
        storeId,
        grantId: id,
        staffUserId: staff.id,
        staffSessionId: staff.sessionId,
      };
      await this.authorize(principal);
      const token = randomBytes(32).toString('base64url');
      await this.audit.record(principal.storeId, {
        id,
        actor: { kind: 'staff', staffUserId: staff.id },
        action: 'support.handoff_issued',
        reason: 'Staff opened authorized support session',
        ip,
      });
      await this.repository.handoff(
        principal.storeId,
        principal,
        hashToken(token),
        new Date(this.clock.now().getTime() + SUPPORT_HANDOFF_TTL_MS),
      );
      return { token };
    });
  }

  async exchange(token: string, ip: string) {
    const hash = hashToken(token);
    const storeId = await this.repository.locateHandoff(hash);
    if (!storeId) throw supportError('SUPPORT_ENDED');
    return this.transaction.runLocked(storeId, async () => {
      const session = await this.repository.handoffSession(storeId, hash);
      if (!session || session.consumedAt || session.handoffExpiresAt <= this.clock.now())
        throw supportError('SUPPORT_ENDED');
      await this.authorize(session);
      const token = randomBytes(32).toString('base64url');
      await this.audit.record(storeId, {
        id: session.grantId,
        actor: { kind: 'staff', staffUserId: session.staffUserId },
        action: 'support.session_started',
        reason: 'Staff entered authorized support session',
        ip,
      });
      await this.repository.consume(storeId, hash, hashToken(token), this.clock.now());
      return token;
    });
  }

  async session(token: string | undefined) {
    return this.readSession(token, async (principal, contextTag) => {
      const { storeId, staffUserId, staffSessionId } = principal;
      const staff = await assertSupportStaff(
        await this.repository.readStaff(storeId, staffUserId),
        {
          storeId,
          clock: this.clock,
          identities: this.identities,
          findParent: () => this.repository.readParent(storeId, staffUserId, staffSessionId),
        },
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
      const result = await this.contacts.getById(principal.storeId, id, { seeFullPhone: true });
      await this.audit.record(principal.storeId, {
        id,
        actor: { kind: 'staff', staffUserId: principal.staffUserId },
        action: 'support.customer_read',
        reason: grant.reason,
        ip,
        details: { grantId: grant.id },
        entityType: 'customer',
      });
      await this.recordActivity(principal);
      return { ...result, contextTag };
    });
  }

  async createCustomer(
    token: string | undefined,
    input: CreateContactInput,
    ip: string,
    expectedContext?: string | string[],
  ) {
    return this.run(token, async (principal, contextTag) => {
      const grant = await this.authorize(principal);
      assertSupportContext(expectedContext, contextTag);
      if (grant.isBreakGlass || grant.access !== 'write' || !grant.scopes.includes('customers'))
        return this.denied(principal, ip);
      const result = await this.contacts.create(
        principal.storeId,
        input,
        { seeFullPhone: true },
        { kind: 'staff', staffUserId: principal.staffUserId },
      );
      await this.audit.record(principal.storeId, {
        id: result.id,
        actor: { kind: 'staff', staffUserId: principal.staffUserId },
        action: 'support.customer_created',
        reason: grant.reason,
        ip,
        details: { grantId: grant.id },
        entityType: 'customer',
      });
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
    const hash = hashToken(token);
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
    const hash = hashToken(token);
    const storeId = await this.repository.locateSession(hash);
    if (!storeId) throw supportError('SUPPORT_ENDED');
    return this.transaction.run(storeId, async () => {
      const session = await this.repository.readSession(storeId, hash);
      if (!session) throw supportError('SUPPORT_ENDED');
      return work(session, supportContextTag(hash));
    });
  }

  private async denied(principal: SupportPrincipal, ip: string) {
    await this.audit.record(principal.storeId, {
      id: principal.grantId,
      actor: { kind: 'staff', staffUserId: principal.staffUserId },
      action: 'support.action_denied',
      reason: 'Support scope denied the requested action',
      ip,
    });
    return null;
  }

  private async authorize(principal: SupportPrincipal) {
    const staff = await this.lockStaff(
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

  private async lockStaff(storeId: string, staffUserId: string, sessionId: string) {
    return assertSupportStaff(await this.repository.staff(storeId, staffUserId), {
      storeId,
      clock: this.clock,
      identities: this.identities,
      findParent: () => this.repository.parent(storeId, staffUserId, sessionId),
    });
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
