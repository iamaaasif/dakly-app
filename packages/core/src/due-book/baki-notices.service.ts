import { Inject, Injectable } from '@nestjs/common';

import { StoreTransaction } from '../platform/database/store-transaction';
import { DAY_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { DueBalancesRepository } from './due-balances.repository';
import { DueEntriesRepository } from './due-entries.repository';
import { DueMessageDeliveryService } from './due-message-delivery.service';
import { bakiNoticeText } from './due-message-templates';
import { DueMessagesRepository } from './due-messages.repository';

@Injectable()
export class BakiNoticesService {
  constructor(
    @Inject(DueEntriesRepository) private readonly entries: DueEntriesRepository,
    @Inject(DueBalancesRepository) private readonly balances: DueBalancesRepository,
    @Inject(DueMessagesRepository) private readonly messages: DueMessagesRepository,
    @Inject(DueMessageDeliveryService) private readonly delivery: DueMessageDeliveryService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  // Runs when `due.added` is relayed, possibly more than once: the notice row is unique per baki.
  async sendForEntry(storeId: string, entryId: string): Promise<void> {
    const messageId = await this.transaction.run(storeId, () => this.store(storeId, entryId));
    if (messageId) await this.delivery.deliver(storeId, messageId);
  }

  private async store(storeId: string, entryId: string): Promise<string | undefined> {
    const existing = await this.messages.findByEntry(storeId, entryId);
    if (existing) return existing.id;
    const entry = await this.entries.findById(storeId, entryId);
    // The khata import and a baki copied from the paper khata record the past; telling the
    // customer "baki added" about them would be wrong and, for an import, a flood.
    if (!entry || entry.kind !== 'baki' || entry.source === 'khata_import') return undefined;
    if (entry.occurredAt.getTime() < entry.createdAt.getTime() - DAY_MS) return undefined;
    const store = await this.stores.settings(storeId);
    if (!store.dueBook.bakiNoticeEnabled) return undefined;
    const { balancePoisha } = await this.balances.balanceOf(storeId, entry.contactId);
    if (balancePoisha <= 0) return undefined;
    const created = await this.messages.insert(storeId, {
      contactId: entry.contactId,
      kind: 'baki_notice',
      entryId,
      body: bakiNoticeText(store.name, entry.amountPoisha, balancePoisha),
    });
    return created?.id;
  }
}
