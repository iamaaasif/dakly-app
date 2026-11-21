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

type Actor = Extract<AuditEntry['actor'], { kind: 'user' }>;

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
  async erase(storeId: string, contactId: string, access: StoreAccess, actor: Actor) {
    if (!this.team.canEraseCustomers(access)) throw contactError('CONTACT_ERASE_NOT_ALLOWED');
    await this.transaction.run(storeId, async () => {
      const { found, conversationIds } = await this.erasure.erase(storeId, contactId);
      if (!found) throw contactError('CONTACT_NOT_FOUND');
      // The audit entry names the contact by id only, so the record holds nothing to erase.
      await this.audit.record(storeId, {
        actor,
        action: 'contacts.erased',
        entityType: 'contact',
        entityId: contactId,
        after: { state: `${conversationIds.length}_chats` },
      });
      // Derived data such as analytics buyers is cleaned by the same event a delete sends.
      await this.outbox.publish({
        type: 'contact.deleted',
        storeId,
        occurredAt: this.clock.now().toISOString(),
        payload: { contactId },
      });
    });
  }
}
