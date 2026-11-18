import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';

import { ConsentService } from '../consents/consent.service';
import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { importError } from './imports.errors';
import { type Import, ImportsRepository } from './imports.repository';

type Actor = AuditEntry['actor'];
const UNDO_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;
const BATCH_ROWS = 500;

@Injectable()
export class UndoCustomerImport {
  constructor(
    @Inject(ImportsRepository) private readonly repository: ImportsRepository,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(ConsentService) private readonly consents: ConsentService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async request(storeId: string, importId: string, _actor: Actor): Promise<void> {
    await this.transaction.run(storeId, async () => {
      const found = await this.repository.findById(storeId, importId);
      if (!found) throw importError('IMPORT_NOT_FOUND');
      if (undoPending(found)) return;
      if (!['done', 'failed'].includes(found.status)) throw importError('IMPORT_NOT_UNDOABLE');
      const now = this.clock.now();
      if (!found.finishedAt || now.getTime() > found.finishedAt.getTime() + UNDO_MILLISECONDS)
        throw importError('IMPORT_UNDO_EXPIRED');
      if (!(await this.repository.markUndone(storeId, importId, now))) {
        const current = await this.repository.findById(storeId, importId);
        if (undoPending(current)) return;
        throw importError('IMPORT_NOT_UNDOABLE');
      }
      await this.outbox.publish({
        type: 'import.undo_requested',
        storeId,
        occurredAt: now.toISOString(),
        payload: { importId },
      });
    });
  }

  async run(storeId: string, importId: string, actor: Actor): Promise<void> {
    const found = await this.repository.findById(storeId, importId);
    if (found?.status !== 'undone' || found.undoFinishedAt) return;
    let after: string | undefined;
    for (;;) {
      const page = await this.transaction.run(storeId, async () => {
        const restored = await this.consents.restoreImportGrants(storeId, importId, after, actor);
        await this.repository.renewUndoProgress(storeId, importId, this.clock.now());
        return restored;
      });
      after = page.after;
      if (page.complete) break;
    }
    await this.removeUneditedContacts(storeId, importId, actor);
    await this.repository.markUndoFinished(storeId, importId, this.clock.now());
  }

  private async removeUneditedContacts(
    storeId: string,
    importId: string,
    actor: Actor,
  ): Promise<void> {
    let after: string | undefined;
    for (;;) {
      const batch = await this.transaction.run(storeId, async () => {
        const ids = await this.contacts.lockUneditedByImport(storeId, importId, {
          after,
          limit: BATCH_ROWS,
        });
        if (ids.length === 0) return ids;
        const answered = await this.contactsWithOwnAnswer(storeId, ids);
        await this.contacts.removeAll(
          storeId,
          ids.filter((id) => !answered.has(id)),
          actor,
        );
        await this.repository.renewUndoProgress(storeId, importId, this.clock.now());
        return ids;
      });
      after = batch.at(-1);
      if (batch.length < BATCH_ROWS) break;
    }
  }

  private async contactsWithOwnAnswer(storeId: string, ids: string[]): Promise<Set<string>> {
    const answered = new Set<string>();
    for (const channel of ['sms', 'whatsapp'] as const)
      for (const answer of await this.consents.currentForAudience(storeId, ids, channel))
        if (answer.status !== 'not_answered') answered.add(answer.contactId);
    return answered;
  }

  async recover(storeId: string, before: Date, _actor: Actor): Promise<void> {
    await this.transaction.run(storeId, async () => {
      const now = this.clock.now();
      const ids = await this.repository.requeuePendingUndos(storeId, before, now);
      await this.outbox.publishAll(
        ids.map((importId) => ({
          type: 'import.undo_requested',
          storeId,
          occurredAt: now.toISOString(),
          payload: { importId },
        })),
      );
    });
  }
}

function undoPending(found: Import | undefined): boolean {
  return found?.status === 'undone' && !found.undoFinishedAt;
}
