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
import type { SegmentRules } from '@dakly/contracts/segments';
import type { StoreAccess } from '@dakly/contracts/team';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { contactError } from './contacts.errors';
import {
  type AudienceRecipient,
  type Contact,
  type ContactFilter,
  type ContactRecipient,
  ContactsRepository,
} from './contacts.repository';

type Access = Pick<StoreAccess, 'seeFullPhone'>;
// Writes take the actor (services.md); nothing records it for contacts yet.
type Actor = AuditEntry['actor'];

@Injectable()
export class ContactsService {
  constructor(
    @Inject(ContactsRepository) private readonly contactsRepository: ContactsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async create(
    storeId: string,
    input: CreateContactInput,
    access: Access,
    _actor: Actor,
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
    // A typed phone proves nothing, so an edited phone is no longer the verified WhatsApp sender.
    const updated = await this.contactsRepository.update(storeId, id, {
      ...change,
      ...(change.phone && { phoneVerifiedAt: null }),
    });
    if (updated === 'phone_taken') throw contactError('CONTACT_PHONE_TAKEN');
    if (!updated) throw contactError('CONTACT_NOT_FOUND');
    return toContactResponse(updated, editor.access.seeFullPhone);
  }

  async remove(storeId: string, id: string, _actor: Actor): Promise<void> {
    if (!(await this.contactsRepository.softDelete(storeId, id, this.clock.now())))
      throw contactError('CONTACT_NOT_FOUND');
  }

  // A deleted contact reads as undefined.
  findRecipient(storeId: string, id: string): Promise<ContactRecipient | undefined> {
    return this.contactsRepository.findRecipient(storeId, id);
  }

  // Deleted contacts are left out.
  findRecipients(storeId: string, ids: string[]): Promise<AudienceRecipient[]> {
    return this.contactsRepository.findRecipients(storeId, ids);
  }

  async assertContactExists(storeId: string, id: string): Promise<void> {
    if (!(await this.contactsRepository.findById(storeId, id))) {
      throw contactError('CONTACT_NOT_FOUND');
    }
  }

  countMatching(storeId: string, rules: SegmentRules): Promise<number> {
    return this.contactsRepository.countMatching(storeId, rules);
  }

  listIdsMatching(
    storeId: string,
    rules: SegmentRules,
    page: { cursor?: string; limit: number },
  ): Promise<string[]> {
    return this.contactsRepository.listIdsMatching(storeId, rules, page);
  }
}

// A partial number is a prefix search only for members who see full phones. Anyone may find a
// contact by its exact full number; the result stays masked without the flag.
function searchFilter(
  search: string | undefined,
  seeFullPhone: boolean,
): Pick<ContactFilter, 'name' | 'phone' | 'phonePrefix'> {
  if (!search) return {};
  const fullPhone = bdMobileSchema.safeParse(search);
  if (fullPhone.success) return { phone: fullPhone.data };
  if (/^\d+$/.test(search)) return seeFullPhone ? { phonePrefix: search } : { phone: search };
  // The trigram name index cannot narrow a search shorter than one trigram.
  if (search.length < 3) throw contactError('CONTACT_SEARCH_TOO_SHORT');
  return { name: search };
}

function toContactResponse(contact: Contact, seeFullPhone: boolean): ContactResponse {
  return {
    ...contact,
    phone: contact.phone && !seeFullPhone ? maskPhone(contact.phone) : contact.phone,
    createdAt: contact.createdAt.toISOString(),
  };
}
