import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type { StoreAccess } from '@dakly/contracts/team';

import { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { TeamService } from '../team/team.service';
import { ContactErasureRepository } from './contact-erasure.repository';
import { contactError } from './contacts.errors';

type Actor = AuditEntry['actor'];

const SWEEP_PAGE_SIZE = 100;

@Injectable()
export class ContactErasureService {
  constructor(
    @Inject(ContactErasureRepository) private readonly erasure: ContactErasureRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(TeamService) private readonly team: TeamService,
  ) {}

  // Erasing is permanent, so only the owner may do it, and it works on a deleted contact too.
  async erase(
    storeId: string,
    contactId: string,
    access: StoreAccess,
    actor: Extract<Actor, { kind: 'user' }>,
  ) {
    if (!this.team.canEraseCustomers(access)) throw contactError('CONTACT_ERASE_NOT_ALLOWED');
    if (!(await this.eraseOne(storeId, contactId, actor))) throw contactError('CONTACT_NOT_FOUND');
  }

  // Customers deleted more than 30 days ago are erased for good (D39). Each one is its own
  // transaction, and one that fails stays due for the next run.
  async eraseDeletedCustomers(): Promise<number> {
    let erased = 0;
    for (const { storeId, contactId } of await this.erasure.dueDeleted(SWEEP_PAGE_SIZE)) {
      if (await this.eraseOne(storeId, contactId, { kind: 'system' })) erased += 1;
    }
    return erased;
  }

  private eraseOne(storeId: string, contactId: string, actor: Actor): Promise<boolean> {
    return this.transaction.run(storeId, async () => {
      const { found, conversationIds, attachmentKeys } = await this.erasure.erase(
        storeId,
        contactId,
      );
      if (!found) return false;
      const occurredAt = this.clock.now().toISOString();
      // The audit entry names the contact by id only, so the record holds nothing to erase.
      await this.audit.record(storeId, {
        actor,
        action: 'contacts.erased',
        entityType: 'contact',
        entityId: contactId,
        after: { state: `${conversationIds.length}_chats` },
      });
      // Analytics buyers are cleaned by the event a delete sends; stored files by the second.
      await this.outbox.publishAll([
        { type: 'contact.deleted', storeId, occurredAt, payload: { contactId } },
        {
          type: 'contact.erased',
          storeId,
          occurredAt,
          payload: { contactId, conversationIds, attachmentKeys },
        },
      ]);
      return true;
    });
  }
}
