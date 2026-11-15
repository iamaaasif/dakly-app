import { Inject, Injectable } from '@nestjs/common';

import type {
  CurrentOwnershipTransferResponse,
  OwnershipTransferResponse,
  StartOwnershipTransferInput,
} from '@dakly/contracts/team';

import { AuditService } from '../audit/audit.service';
import { SignInCodes, type SignInSubject } from '../auth/codes.module';
import { UsersService } from '../auth/users.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { MembersRepository } from './members.repository';
import {
  OwnershipTransferRepository,
  type OwnershipTransfer,
} from './ownership-transfer.repository';
import { canDo } from './permissions';
import { teamError } from './team.errors';
import { TeamService } from './team.service';

@Injectable()
export class OwnershipTransferService {
  constructor(
    @Inject(OwnershipTransferRepository) private readonly repository: OwnershipTransferRepository,
    @Inject(MembersRepository) private readonly members: MembersRepository,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(SignInCodes) private readonly codes: SignInCodes,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async requestCode(
    storeId: string,
    membershipId: string,
    userId: string,
    ip: string,
  ): Promise<void> {
    const subject = await this.transaction.run(storeId, async () => {
      const identity = await this.users.lockVerifiedIdentity(storeId, userId);
      return this.transaction.runLocked(storeId, async () => {
        await this.assertOwner(storeId, userId);
        await this.assertNoTransfer(storeId);
        const member = await this.recipient(storeId, membershipId, userId);
        return this.subject(storeId, userId, member.userId!, membershipId, identity);
      });
    });
    await this.codes.send(subject, 'ownership_transfer', ip);
  }

  async start(
    storeId: string,
    input: StartOwnershipTransferInput,
    userId: string,
    ip: string,
  ): Promise<OwnershipTransferResponse> {
    await this.assertOwner(storeId, userId);
    const member = await this.recipient(storeId, input.membershipId, userId);
    const identity = await this.users.lockVerifiedIdentity(storeId, userId);
    const subject = this.subject(storeId, userId, member.userId!, input.membershipId, identity);
    // Consumption is independent of the store transaction: rollback never restores proof.
    const grant = await this.codes.consume(subject, 'ownership_transfer', input.code, ip);
    if (grant.userId !== userId) throw teamError('TRANSFER_PROOF_INVALID');
    return this.transaction.run(storeId, async () => {
      const currentIdentity = await this.users.lockVerifiedIdentity(storeId, userId);
      return this.transaction.runLocked(storeId, async () => {
        await this.assertOwner(storeId, userId);
        const currentMember = await this.recipient(storeId, input.membershipId, userId);
        const currentSubject = this.subject(
          storeId,
          userId,
          currentMember.userId!,
          input.membershipId,
          currentIdentity,
        );
        if (currentSubject.binding !== subject.binding) throw teamError('TRANSFER_PROOF_INVALID');
        await this.assertNoTransfer(storeId);
        const now = this.clock.now();
        await this.repository.expire(storeId, now);
        const transfer = await this.repository.insert(
          storeId,
          userId,
          currentMember.userId!,
          new Date(now.getTime() + 48 * 3600000),
        );
        await this.record(storeId, transfer.id, userId, 'ownership_transfer.started');
        return this.response(transfer);
      });
    });
  }

  async current(storeId: string, userId: string): Promise<CurrentOwnershipTransferResponse> {
    const transfer = await this.repository.current(storeId, this.clock.now());
    if (!transfer) return { transfer: null };
    if (transfer.newOwnerUserId !== userId) await this.assertOwner(storeId, userId);
    return { transfer: this.response(transfer) };
  }

  async cancel(storeId: string, transferId: string, userId: string): Promise<void> {
    await this.transaction.runLocked(storeId, async () => {
      await this.assertOwner(storeId, userId);
      await this.openTransfer(storeId, transferId);
      await this.repository.finish(storeId, transferId, 'cancelled', this.clock.now());
      await this.record(storeId, transferId, userId, 'ownership_transfer.cancelled');
    });
  }

  async accept(
    storeId: string,
    transferId: string,
    userId: string,
  ): Promise<OwnershipTransferResponse> {
    return this.transaction.run(storeId, async () => {
      // User reads and the ownership advisory lock precede the shared store mutation lock.
      const identity = await this.users.lockVerifiedIdentity(storeId, userId);
      if (!identity) throw teamError('TRANSFER_DENIED');
      const ownedStore = await this.team.lockAndFindOwnedStore(storeId, userId);
      return this.transaction.runLocked(storeId, async () => {
        const transfer = await this.openTransfer(storeId, transferId);
        if (transfer.newOwnerUserId !== userId) throw teamError('TRANSFER_DENIED');
        if (ownedStore) throw teamError('TRANSFER_STORE_LIMIT');
        await this.assertOwner(storeId, transfer.ownerUserId);
        const previous = await this.members.forUser(storeId, transfer.ownerUserId);
        const next = await this.members.forUser(storeId, userId);
        if (next?.status !== 'active') throw teamError('TRANSFER_INVALID');
        const now = this.clock.now();
        await this.members.change(
          storeId,
          previous!.id,
          { builtInRole: 'admin', roleId: null },
          now,
        );
        await this.members.change(storeId, next.id, { builtInRole: 'owner', roleId: null }, now);
        await this.recordRole(storeId, previous!.id, userId);
        await this.recordRole(storeId, next.id, userId);
        const accepted = await this.repository.finish(storeId, transferId, 'accepted', now);
        await this.record(storeId, transferId, userId, 'ownership_transfer.accepted');
        return this.response(accepted);
      });
    });
  }

  private async assertOwner(storeId: string, userId: string): Promise<void> {
    const access = await this.team.accessFor(storeId, userId);
    if (!access || !canDo(access, 'ownership.transfer')) throw teamError('TRANSFER_DENIED');
  }

  private async assertNoTransfer(storeId: string): Promise<void> {
    if (await this.repository.current(storeId, this.clock.now()))
      throw teamError('TRANSFER_EXISTS');
  }

  private async recipient(storeId: string, membershipId: string, ownerId: string) {
    const member = await this.members.find(storeId, membershipId);
    if (!member) throw teamError('MEMBER_NOT_FOUND');
    if (member.status !== 'active' || !member.userId || member.userId === ownerId)
      throw teamError('TRANSFER_INVALID');
    return member;
  }

  private async openTransfer(storeId: string, transferId: string): Promise<OwnershipTransfer> {
    const transfer = await this.repository.find(storeId, transferId);
    if (!transfer) throw teamError('TRANSFER_NOT_FOUND');
    if (transfer.status !== 'pending' || transfer.expiresAt <= this.clock.now())
      throw teamError('TRANSFER_INVALID');
    return transfer;
  }

  private subject(
    storeId: string,
    userId: string,
    newOwnerId: string,
    membershipId: string,
    identity: Awaited<ReturnType<UsersService['lockVerifiedIdentity']>>,
  ): SignInSubject {
    const delivery = this.deliveryIdentity(identity);
    return {
      userId,
      target: delivery.target,
      email: delivery.email,
      phone: delivery.phone,
      binding: JSON.stringify([
        storeId,
        userId,
        newOwnerId,
        membershipId,
        delivery.target,
        delivery.verifiedAt.toISOString(),
      ]),
    };
  }

  private deliveryIdentity(identity: Awaited<ReturnType<UsersService['lockVerifiedIdentity']>>) {
    if (!identity) throw teamError('TRANSFER_IDENTITY_REQUIRED');
    if (identity.email && identity.emailVerifiedAt)
      return {
        target: identity.email,
        email: identity.email,
        phone: undefined,
        verifiedAt: identity.emailVerifiedAt,
      };
    if (identity.phone && identity.phoneVerifiedAt)
      return {
        target: identity.phone,
        email: undefined,
        phone: identity.phone,
        verifiedAt: identity.phoneVerifiedAt,
      };
    throw teamError('TRANSFER_IDENTITY_REQUIRED');
  }

  private response(transfer: OwnershipTransfer): OwnershipTransferResponse {
    return { ...transfer, expiresAt: transfer.expiresAt.toISOString() };
  }

  private record(storeId: string, entityId: string, userId: string, action: string): Promise<void> {
    return this.audit.record(storeId, {
      actor: { kind: 'user', userId },
      action,
      entityType: 'ownership_transfer',
      entityId,
    });
  }

  private recordRole(storeId: string, entityId: string, userId: string): Promise<void> {
    return this.audit.record(storeId, {
      actor: { kind: 'user', userId },
      action: 'member.role_changed',
      entityType: 'membership',
      entityId,
      after: { changedFields: ['builtInRole', 'roleId'] },
    });
  }
}
