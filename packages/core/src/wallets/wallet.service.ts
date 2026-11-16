import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type { MessagingWallet, WalletBalancesResponse } from '@dakly/contracts/wallets';

import { StoreTransaction } from '../platform/database/store-transaction';
import {
  type NewWalletEntry,
  type WalletEntry,
  WalletLedgerRepository,
} from './wallet-ledger.repository';
import { walletError } from './wallets.errors';

type WalletActor = AuditEntry['actor'];
type ReserveInput = {
  wallet: MessagingWallet;
  quantity: number;
  idempotencyKey: string;
  actor: WalletActor;
};
type SettleInput = { reservationId: string; idempotencyKey: string; actor: WalletActor };
type CreditInput = {
  wallet: MessagingWallet;
  quantity: number;
  idempotencyKey: string;
  staffUserId: string;
  staffAuditId: string;
};
type EntryChange = Pick<
  NewWalletEntry,
  'kind' | 'quantityDelta' | 'idempotencyKey' | 'referenceType' | 'referenceId'
>;
type LedgerWrite = {
  wallet: WalletEntry['wallet'];
  idempotencyKey: string;
  actor: ReturnType<typeof actorColumns>;
  changes: () => EntryChange[] | Promise<EntryChange[]>;
};
export type WalletWriteResult = { entryId: string; balanceQuantity: number };

@Injectable()
export class WalletService {
  constructor(
    @Inject(WalletLedgerRepository) private readonly ledger: WalletLedgerRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  async balance(storeId: string, wallet: MessagingWallet): Promise<number> {
    return (await this.ledger.latest(storeId, wallet))?.balanceQuantityAfter ?? 0;
  }

  async balances(storeId: string): Promise<WalletBalancesResponse> {
    return {
      smsCredits: await this.balance(storeId, 'sms_credits'),
      whatsappPoisha: await this.balance(storeId, 'whatsapp_poisha'),
    };
  }

  async findByIdempotencyKey(storeId: string, key: string): Promise<WalletWriteResult | undefined> {
    const entry = await this.ledger.findByIdempotencyKey(storeId, key);
    return entry && toResult(entry);
  }

  reserve(storeId: string, input: ReserveInput): Promise<WalletWriteResult> {
    return this.transaction.run(storeId, () =>
      this.append(storeId, {
        wallet: input.wallet,
        idempotencyKey: input.idempotencyKey,
        actor: actorColumns(input.actor),
        changes: () => [
          { kind: 'reserve', quantityDelta: -input.quantity, idempotencyKey: input.idempotencyKey },
        ],
      }),
    );
  }

  release(storeId: string, input: SettleInput): Promise<WalletWriteResult> {
    return this.settle(storeId, input, (reservation) => [
      releaseOf(reservation, input.idempotencyKey),
    ]);
  }

  // The whole reservation goes back and the charge is its own row, so a full charge still
  // writes a non-zero delta and every settled reservation has exactly one release row.
  charge(storeId: string, input: SettleInput & { quantity: number }): Promise<WalletWriteResult> {
    return this.settle(storeId, input, (reservation) => {
      if (input.quantity > -reservation.quantityDelta)
        throw walletError('WALLET_CHARGE_OVER_RESERVATION');
      return [
        releaseOf(reservation, `${input.idempotencyKey}:release`),
        {
          kind: 'charge',
          quantityDelta: -input.quantity,
          idempotencyKey: input.idempotencyKey,
          referenceType: 'wallet_reservation',
          referenceId: reservation.id,
        },
      ];
    });
  }

  credit(storeId: string, input: CreditInput): Promise<WalletWriteResult> {
    return this.transaction.run(storeId, () =>
      this.append(storeId, {
        wallet: input.wallet,
        idempotencyKey: input.idempotencyKey,
        actor: actorColumns({ kind: 'staff', staffUserId: input.staffUserId }),
        changes: () => [
          {
            kind: 'adjustment',
            quantityDelta: input.quantity,
            idempotencyKey: input.idempotencyKey,
            referenceType: 'staff_audit',
            referenceId: input.staffAuditId,
          },
        ],
      }),
    );
  }

  private settle(
    storeId: string,
    input: SettleInput,
    changes: (reservation: WalletEntry) => EntryChange[],
  ): Promise<WalletWriteResult> {
    return this.transaction.run(storeId, async () => {
      const reservation = await this.ledger.findById(storeId, input.reservationId);
      if (reservation?.kind !== 'reserve') throw walletError('WALLET_RESERVATION_NOT_FOUND');
      return this.append(storeId, {
        wallet: reservation.wallet,
        idempotencyKey: input.idempotencyKey,
        actor: actorColumns(input.actor),
        changes: async () => {
          if (await this.ledger.findRelease(storeId, reservation))
            throw walletError('WALLET_RESERVATION_SETTLED');
          return changes(reservation);
        },
      });
    });
  }

  // Runs inside the store transaction: the lock makes the replay check, the revision read and
  // the insert one step per wallet.
  private async append(
    storeId: string,
    { wallet, idempotencyKey, actor, changes }: LedgerWrite,
  ): Promise<WalletWriteResult> {
    await this.ledger.lockWallet(storeId, wallet);
    const replay = await this.ledger.findByIdempotencyKey(storeId, idempotencyKey);
    if (replay) return toResult(replay);
    const latest = await this.ledger.latest(storeId, wallet);
    let revision = latest?.revision ?? 0;
    let balance = latest?.balanceQuantityAfter ?? 0;
    const entries: NewWalletEntry[] = [];
    for (const change of await changes()) {
      revision += 1;
      balance += change.quantityDelta;
      if (balance < 0) throw walletError('WALLET_BALANCE_TOO_LOW');
      entries.push({ ...change, ...actor, wallet, revision, balanceQuantityAfter: balance });
    }
    const inserted = await this.ledger.insert(storeId, entries);
    if (inserted === 'balance_negative') throw walletError('WALLET_BALANCE_TOO_LOW');
    return toResult(inserted.find((entry) => entry.revision === revision)!);
  }
}

function releaseOf(reservation: WalletEntry, idempotencyKey: string): EntryChange {
  return {
    kind: 'release',
    quantityDelta: -reservation.quantityDelta,
    idempotencyKey,
    referenceType: 'wallet_reservation',
    referenceId: reservation.id,
  };
}

function actorColumns(actor: WalletActor) {
  if (actor.kind === 'user') return { actorType: 'user' as const, actorUserId: actor.userId };
  if (actor.kind === 'staff')
    return { actorType: 'staff' as const, actorStaffId: actor.staffUserId };
  return { actorType: 'system' as const };
}

function toResult(entry: WalletEntry): WalletWriteResult {
  return { entryId: entry.id, balanceQuantity: entry.balanceQuantityAfter };
}
