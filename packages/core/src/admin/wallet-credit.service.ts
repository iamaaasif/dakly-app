import { Inject, Injectable } from '@nestjs/common';

import type { StaffIdentity } from '@dakly/contracts/staff-auth';
import {
  walletCreditEffectSchema,
  type WalletCreditConfirmation,
  type WalletCreditEffect,
  type WalletCreditPreview,
  type WalletCreditRequest,
  type WalletCreditResponse,
} from '@dakly/contracts/wallets';

import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { WalletService, type WalletWriteResult } from '../wallets/wallet.service';
import { RiskyActionConfirmation, RISKY_ACTION_CONFIRM_MS } from './risky-action-confirmation';
import { SupportAuditService } from './support-audit.service';
import { supportError } from './support.errors';
import { SupportRepository } from './support.repository';
import { SupportService } from './support.service';

type Staff = StaffIdentity & { sessionId: string };

// Staff grant SMS credits and WhatsApp balance until billing sells them (P4, D28).
@Injectable()
export class WalletCreditService {
  constructor(
    @Inject(SupportRepository) private readonly repository: SupportRepository,
    @Inject(SupportService) private readonly support: SupportService,
    @Inject(SupportAuditService) private readonly audit: SupportAuditService,
    @Inject(WalletService) private readonly wallets: WalletService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(RiskyActionConfirmation) private readonly confirmation: RiskyActionConfirmation,
  ) {}

  async preview(
    staff: Staff,
    storeId: string,
    input: WalletCreditRequest,
  ): Promise<WalletCreditPreview> {
    const target = (await this.repository.targets(storeId))[0];
    if (!target) throw supportError('SUPPORT_NOT_FOUND');
    return this.transaction.run(target.id, async () => {
      await this.support.authorizeWalletCredit(target.id, staff);
      const effect = walletCreditEffectSchema.parse({
        ...input,
        action: 'wallet.credited',
        id: newId(),
        storeId: target.id,
        staffUserId: staff.id,
        staffSessionId: staff.sessionId,
        shopName: target.name,
        confirmBy: new Date(this.clock.now().getTime() + RISKY_ACTION_CONFIRM_MS).toISOString(),
      });
      return { effect, proof: this.confirmation.sign(effect) };
    });
  }

  async confirm(
    staff: Staff,
    storeId: string,
    input: WalletCreditConfirmation,
    ip: string,
  ): Promise<WalletCreditResponse> {
    this.confirmation.verify(input.effect, input.proof);
    const effect = input.effect;
    if (
      effect.storeId !== storeId ||
      effect.staffUserId !== staff.id ||
      effect.staffSessionId !== staff.sessionId
    )
      throw supportError('CONFIRMATION_INVALID');
    // The store lock serializes retries of one effect, so a replay never writes a second audit row.
    return this.transaction.runLocked(storeId, async () => {
      await this.support.authorizeWalletCredit(storeId, staff);
      if (
        new Date(effect.confirmBy) <= this.clock.now() ||
        (await this.repository.storeName(storeId)) !== effect.shopName
      )
        throw supportError('CONFIRMATION_INVALID');
      const replay = await this.wallets.findByIdempotencyKey(storeId, effect.id);
      if (replay) return creditResponse(effect, replay);
      const staffAuditId = await this.audit.record(storeId, {
        id: effect.id,
        actor: { kind: 'staff', staffUserId: staff.id },
        action: effect.action,
        reason: effect.reason,
        ip,
        details: { wallet: effect.wallet, quantity: effect.quantity },
        entityType: 'wallet_credit',
      });
      const credit = await this.wallets.credit(storeId, {
        wallet: effect.wallet,
        quantity: effect.quantity,
        idempotencyKey: effect.id,
        staffUserId: staff.id,
        staffAuditId,
      });
      return creditResponse(effect, credit);
    });
  }
}

function creditResponse(
  effect: WalletCreditEffect,
  credit: WalletWriteResult,
): WalletCreditResponse {
  return { id: credit.entryId, wallet: effect.wallet, balanceQuantity: credit.balanceQuantity };
}
