import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  ContactDetailResponse,
  ContactListQuery,
  ContactListResponse,
  ContactResponse,
  CreateContactInput,
  UpdateContactInput,
} from '@dakly/contracts/contacts';
import { bdMobileSchema, maskPhone } from '@dakly/contracts/phone';
import type { StoreAccess } from '@dakly/contracts/team';

import { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { contactError } from './contacts.errors';
import { type Contact, type ContactFilter, ContactsRepository } from './contacts.repository';

type Access = Pick<StoreAccess, 'seeFullPhone'>;
type Actor = AuditEntry['actor'];

@Injectable()
export class ContactsService {
  constructor(
    @Inject(ContactsRepository) private readonly contactsRepository: ContactsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async create(
    storeId: string,
    input: CreateContactInput,
    access: Access,
    actor: Actor,
  ): Promise<ContactResponse> {
    const contact = await this.transaction.run(storeId, async () => {
      // A staff add is an intentional customer under the glossary, whatever its orders.
      const created = await this.contactsRepository.insert(storeId, {
        ...input,
        source: 'manual',
        kind: 'customer',
      });
      if (!created) throw contactError('CONTACT_PHONE_TAKEN');
      await this.outbox.publish({
        type: 'contact.created',
        storeId,
        occurredAt: this.clock.now().toISOString(),
        payload: { contactId: created.id },
      });
      await this.audit.record(storeId, {
        actor,
        action: 'contact.created',
        entityType: 'contact',
        entityId: created.id,
      });
      return created;
    });
    return toContactResponse(contact, access.seeFullPhone);
  }

  async list(
    storeId: string,
    query: ContactListQuery,
    access: Access,
  ): Promise<ContactListResponse> {
    const { search, ...filter } = query;
    const rows = await this.contactsRepository.list(storeId, {
      ...filter,
      ...searchFilter(search, access.seeFullPhone),
    });
    const items = rows
      .slice(0, query.limit)
      .map((contact) => toContactResponse(contact, access.seeFullPhone));
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
  }

  async getById(storeId: string, id: string, access: Access): Promise<ContactDetailResponse> {
    const contact = await this.contactsRepository.findById(storeId, id);
    if (!contact) throw contactError('CONTACT_NOT_FOUND');
    return {
      ...toContactResponse(contact, access.seeFullPhone),
      identities: await this.contactsRepository.findIdentities(storeId, id),
    };
  }

  async editDetails(
    storeId: string,
    id: string,
    change: UpdateContactInput,
    editor: { access: Access; actor: Actor },
  ): Promise<ContactResponse> {
    const contact = await this.transaction.run(storeId, async () => {
      const updated = await this.contactsRepository.update(storeId, id, change);
      if (updated === 'phone_taken') throw contactError('CONTACT_PHONE_TAKEN');
      if (!updated) throw contactError('CONTACT_NOT_FOUND');
      // Field names only: the audit log never holds the name or phone itself.
      await this.audit.record(storeId, {
        actor: editor.actor,
        action: 'contact.updated',
        entityType: 'contact',
        entityId: id,
        after: { changedFields: Object.keys(change) },
      });
      return updated;
    });
    return toContactResponse(contact, editor.access.seeFullPhone);
  }

  async remove(storeId: string, id: string, actor: Actor): Promise<void> {
    await this.transaction.run(storeId, async () => {
      if (!(await this.contactsRepository.softDelete(storeId, id, this.clock.now())))
        throw contactError('CONTACT_NOT_FOUND');
      await this.audit.record(storeId, {
        actor,
        action: 'contact.deleted',
        entityType: 'contact',
        entityId: id,
      });
    });
  }
}

// Without "See full phone numbers" digits are matched whole, so part of a number finds nothing;
// a prefix search would let a member read the hidden digits back one search at a time.
function searchFilter(
  search: string | undefined,
  seeFullPhone: boolean,
): Pick<ContactFilter, 'name' | 'phone' | 'phonePrefix'> {
  if (!search) return {};
  const fullPhone = bdMobileSchema.safeParse(search);
  if (fullPhone.success) return { phone: fullPhone.data };
  if (/^\d+$/.test(search)) return seeFullPhone ? { phonePrefix: search } : { phone: search };
  return { name: search };
}

function toContactResponse(contact: Contact, seeFullPhone: boolean): ContactResponse {
  return {
    ...contact,
    phone: contact.phone && !seeFullPhone ? maskPhone(contact.phone) : contact.phone,
    createdAt: contact.createdAt.toISOString(),
  };
}
