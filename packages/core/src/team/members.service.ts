import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { maskPhone } from '@dakly/contracts/phone';
import type { UserProfile } from '@dakly/contracts/sessions';
import {
  customRolePermissionsSchema,
  type AcceptInviteResponse,
  type InviteMemberInput,
  type MemberListQuery,
  type MemberListResponse,
  type MemberResponse,
  type MemberRoleInput,
  type StoreAccess,
} from '@dakly/contracts/team';

import { AuditService } from '../audit/audit.service';
import { UsersService } from '../auth/users.service';
import { BillingService } from '../billing/billing.service';
import { Clock } from '../platform/clock';
import { hashToken } from '../platform/crypto/token-hash';
import { StoreTransaction } from '../platform/database/store-transaction';
import { DAY_MS } from '../platform/time';
import { builtInRoleAccess } from './built-in-roles';
import { InviteDelivery } from './invite-delivery';
import { assertInviteRecipient, assertOpenInvite } from './invite-policy';
import { MembersRepository, roleValues, type Member } from './members.repository';
import { canManageMember, hasSameMemberRole } from './permissions';
import { teamError } from './team.errors';

type Actor = { userId: string; access: StoreAccess };
const INVITE_TTL_MS = 7 * DAY_MS;
const revokedToken = { inviteTokenHash: null, inviteExpiresAt: null };

@Injectable()
export class MembersService {
  constructor(
    @Inject(MembersRepository) private readonly repository: MembersRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(InviteDelivery) private readonly delivery: InviteDelivery,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async list(
    storeId: string,
    query: MemberListQuery,
    access: StoreAccess,
  ): Promise<MemberListResponse> {
    const { rows, seats } = await this.transaction.run(storeId, async () => ({
      rows: await this.repository.list(storeId, query),
      seats: {
        used: await this.repository.countSeats(storeId, this.clock.now()),
        limit: await this.billing.seatLimit(storeId),
      },
    }));
    const page = rows.slice(0, query.limit);
    // Profiles use the shared pool, so read them after the store connection is released.
    const profiles = await this.users.profiles(
      page.flatMap((row) => (row.userId ? [row.userId] : [])),
    );
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    return {
      items: page.map((row) =>
        this.response(row, access.seeFullPhone, row.userId ? byId.get(row.userId) : undefined),
      ),
      nextCursor: rows.length > query.limit ? page.at(-1)!.id : null,
      seats,
    };
  }

  async invite(
    storeId: string,
    input: InviteMemberInput,
    actor: Actor,
    ip: string,
  ): Promise<MemberResponse> {
    const proposed = await this.roleAccess(storeId, roleValues(input));
    this.assertManagement(actor, proposed, proposed);
    const existing = await this.repository.findRecipient(storeId, input);
    if (existing) return this.existingInvite(existing, input, actor.access.seeFullPhone);
    await this.assertNotActive(storeId, input);
    await this.delivery.reserve(storeId, input, ip);
    const token = randomBytes(32).toString('hex');
    const result = await this.transaction.runLocked(storeId, async () => {
      const duplicate = await this.repository.findRecipient(storeId, input);
      if (duplicate) return { member: duplicate, created: false };
      await this.assertNotActive(storeId, input);
      const currentRole = await this.roleAccess(storeId, roleValues(input));
      this.assertManagement(actor, currentRole, currentRole);
      await this.assertSeat(storeId);
      const member = await this.repository.insertInvite(storeId, {
        input,
        userId: actor.userId,
        hash: hashToken(token),
        expiresAt: this.expiry(),
      });
      await this.record(storeId, member.id, actor.userId, 'member.invited');
      return { member, created: true };
    });
    if (!result.created)
      return this.existingInvite(result.member, input, actor.access.seeFullPhone);
    await this.delivery.send(input, token);
    return this.response(result.member, actor.access.seeFullPhone);
  }

  async resend(
    storeId: string,
    membershipId: string,
    actor: Actor,
    ip: string,
  ): Promise<MemberResponse> {
    const before = await this.findMember(storeId, membershipId);
    const role = await this.roleAccess(storeId, before);
    this.assertManagement(actor, role, role);
    if (before.status !== 'invited') throw teamError('INVITE_INVALID');
    const recipient = {
      phone: before.invitePhone ?? undefined,
      email: before.inviteEmail ?? undefined,
    };
    await this.delivery.reserve(storeId, recipient, ip);
    const token = randomBytes(32).toString('hex');
    const member = await this.transaction.runLocked(storeId, async () => {
      const current = await this.findMember(storeId, membershipId);
      if (current.status !== 'invited') throw teamError('INVITE_INVALID');
      const access = await this.roleAccess(storeId, current);
      this.assertManagement(actor, access, access);
      if (!current.inviteExpiresAt || current.inviteExpiresAt <= this.clock.now())
        await this.assertSeat(storeId);
      const updated = await this.repository.change(
        storeId,
        membershipId,
        { inviteTokenHash: hashToken(token), inviteExpiresAt: this.expiry() },
        this.clock.now(),
      );
      await this.record(storeId, membershipId, actor.userId, 'member.invite_resent');
      return updated;
    });
    await this.delivery.send(recipient, token);
    return this.response(member, actor.access.seeFullPhone);
  }

  async changeRole(
    storeId: string,
    membershipId: string,
    input: MemberRoleInput,
    actor: Actor,
  ): Promise<MemberResponse> {
    const member = await this.transaction.runLocked(storeId, async () => {
      const current = await this.findMember(storeId, membershipId);
      if (current.status === 'removed') throw teamError('MEMBER_NOT_FOUND');
      this.assertManagement(
        actor,
        await this.roleAccess(storeId, current),
        await this.roleAccess(storeId, roleValues(input)),
      );
      const changed = await this.repository.change(
        storeId,
        membershipId,
        roleValues(input),
        this.clock.now(),
      );
      await this.record(storeId, membershipId, actor.userId, 'member.role_changed');
      return changed;
    });
    const profile = member.userId ? await this.users.profile(member.userId) : undefined;
    return this.response(member, actor.access.seeFullPhone, profile);
  }

  async remove(storeId: string, membershipId: string, actor: Actor): Promise<void> {
    await this.transaction.runLocked(storeId, async () => {
      const member = await this.findMember(storeId, membershipId);
      this.assertManagement(actor, await this.roleAccess(storeId, member));
      if (member.status === 'removed') return;
      await this.repository.change(
        storeId,
        membershipId,
        { status: 'removed', removedAt: this.clock.now(), ...revokedToken },
        this.clock.now(),
      );
      await this.record(storeId, membershipId, actor.userId, 'member.removed');
    });
  }

  async accept(userId: string, token: string): Promise<AcceptInviteResponse> {
    const tokenHash = hashToken(token);
    const located = await this.repository.locateInvite(tokenHash);
    if (!located) throw teamError('INVITE_INVALID');
    return this.transaction.run(located.storeId, async () => {
      // Lock identity before the store, so email replacement cannot race recipient proof.
      const identity = await this.users.lockVerifiedIdentity(located.storeId, userId);
      return this.transaction.runLocked(located.storeId, async () => {
        const member = await this.findMember(located.storeId, located.membershipId);
        assertOpenInvite(member, this.clock.now());
        if (!(await this.repository.matchesToken(located.storeId, member.id, tokenHash)))
          throw teamError('INVITE_INVALID');
        assertInviteRecipient(member, identity);
        const existing = await this.repository.forUser(located.storeId, userId);
        if (existing?.status === 'active') throw teamError('MEMBER_ALREADY_ACTIVE');
        await this.activate(located.storeId, member, existing, userId);
        return { storeId: located.storeId, membershipId: existing?.id ?? member.id };
      });
    });
  }

  private async activate(
    storeId: string,
    invite: Member,
    existing: Member | undefined,
    userId: string,
  ): Promise<void> {
    const now = this.clock.now();
    if (existing)
      await this.repository.change(
        storeId,
        invite.id,
        { status: 'removed', removedAt: now, ...revokedToken },
        now,
      );
    await this.repository.change(
      storeId,
      existing?.id ?? invite.id,
      {
        userId,
        builtInRole: invite.builtInRole,
        roleId: invite.roleId,
        status: 'active',
        joinedAt: now,
        removedAt: null,
        ...revokedToken,
      },
      now,
    );
    await this.record(storeId, existing?.id ?? invite.id, userId, 'member.joined');
  }

  private async roleAccess(
    storeId: string,
    role: { builtInRole: Member['builtInRole']; roleId: string | null },
  ): Promise<StoreAccess> {
    if (role.builtInRole) return builtInRoleAccess[role.builtInRole];
    if (!role.roleId) throw teamError('ROLE_NOT_FOUND');
    const parsed = customRolePermissionsSchema.safeParse(
      await this.repository.findRole(storeId, role.roleId),
    );
    if (!parsed.success) throw teamError('ROLE_NOT_FOUND');
    return { role: 'custom', ...parsed.data };
  }

  private assertManagement(actor: Actor, current: StoreAccess, proposed?: StoreAccess): void {
    if (!canManageMember(actor.access, current, proposed)) throw teamError('TEAM_ROLE_DENIED');
  }

  private async assertSeat(storeId: string): Promise<void> {
    if (
      (await this.repository.countSeats(storeId, this.clock.now())) >=
      (await this.billing.seatLimit(storeId))
    )
      throw teamError('TEAM_SEATS_FULL');
  }

  private async assertNotActive(storeId: string, input: InviteMemberInput): Promise<void> {
    const identity = await this.users.verifiedRecipient(storeId, input);
    if (identity && (await this.repository.forUser(storeId, identity))?.status === 'active')
      throw teamError('MEMBER_ALREADY_ACTIVE');
  }

  private async findMember(storeId: string, membershipId: string): Promise<Member> {
    const member = await this.repository.find(storeId, membershipId);
    if (!member) throw teamError('MEMBER_NOT_FOUND');
    return member;
  }

  private existingInvite(
    member: Member,
    input: MemberRoleInput,
    seeFullPhone: boolean,
  ): MemberResponse {
    if (!hasSameMemberRole(member, input)) throw teamError('INVITE_EXISTS');
    return this.response(member, seeFullPhone);
  }

  private expiry(): Date {
    return new Date(this.clock.now().getTime() + INVITE_TTL_MS);
  }

  private record(storeId: string, entityId: string, userId: string, action: string): Promise<void> {
    return this.audit.record(storeId, {
      actor: { kind: 'user', userId },
      action,
      entityType: 'membership',
      entityId,
    });
  }

  private response(member: Member, seeFullPhone: boolean, profile?: UserProfile): MemberResponse {
    const identity = profile ?? {
      name: null,
      phone: member.invitePhone,
      email: member.inviteEmail,
    };
    const phone = identity.phone;
    return {
      id: member.id,
      userId: member.userId,
      name: identity.name,
      phone: phone && !seeFullPhone ? maskPhone(phone) : phone,
      email: identity.email,
      builtInRole: member.builtInRole,
      roleId: member.roleId,
      status: member.status,
      inviteExpiresAt: member.inviteExpiresAt?.toISOString() ?? null,
      lastActiveAt: member.lastActiveAt?.toISOString() ?? null,
    };
  }
}
