import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  ContactDetailResponse,
  ContactImportRow,
  ContactListQuery,
  ContactListResponse,
  ContactResponse,
  CreateContactInput,
  ImportDuplicateMode,
  UpdateContactInput,
} from '@dakly/contracts/contacts';
import { MAX_CONTACT_TAGS } from '@dakly/contracts/contacts';
import type { CreateOrderInput, OrderDetail } from '@dakly/contracts/orders';
import { bdMobileSchema, maskPhone } from '@dakly/contracts/phone';
import type { SegmentRules } from '@dakly/contracts/segments';
import type { StoreAccess } from '@dakly/contracts/team';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { ContactDeletionService } from './contact-deletion.service';
import { ContactIdentitiesRepository, type InboundIdentity } from './contact-identities.repository';
import { ContactMatchSuggestionsService } from './contact-match-suggestions.service';
import { ContactPhoneAccessService } from './contact-phone-access.service';
import { contactError } from './contacts.errors';
import {
  type AudienceRecipient,
  type Contact,
  type ContactFilter,
  type ContactRecipient,
  ContactsRepository,
  type TagChange,
} from './contacts.repository';
import {
  ImportContactsRepository,
  type ImportedChange,
  type ImportMatch,
} from './import-contacts.repository';
import { OrderContactsRepository } from './order-contacts.repository';

type Access = Pick<StoreAccess, 'seeFullPhone'>;
type Actor = AuditEntry['actor'];

export type ImportedContact = {
  contactId: string;
  phone: string;
  outcome: 'added' | 'updated' | 'skipped';
  hasWhatsappNumberMismatch: boolean;
  // Cells the D42 rule left out, for the import report.
  notChanged: { field: 'whatsappPhone' | 'tags'; message: string }[];
};

export type ImportContactBatch = {
  rows: ContactImportRow[];
  duplicateMode: ImportDuplicateMode;
  whatsappAnswered: Set<string>;
  matchedContactIds: Set<string>;
};

@Injectable()
export class ContactsService {
  constructor(
    @Inject(ContactsRepository) private readonly contactsRepository: ContactsRepository,
    @Inject(ContactIdentitiesRepository) private readonly identities: ContactIdentitiesRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ImportContactsRepository) private readonly importContacts: ImportContactsRepository,
    @Inject(OrderContactsRepository) private readonly orderContacts: OrderContactsRepository,
    @Inject(ContactDeletionService) private readonly deletion: ContactDeletionService,
    @Inject(ContactPhoneAccessService) private readonly phoneAccess: ContactPhoneAccessService,
    @Inject(ContactMatchSuggestionsService)
    private readonly matchSuggestions: ContactMatchSuggestionsService,
  ) {}

  async create(storeId: string, input: CreateContactInput, access: Access, actor: Actor) {
    await this.phoneAccess.checkLimit(storeId, 'write', access.seeFullPhone, actor);
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

  findOrCreateByIdentity(storeId: string, input: InboundIdentity) {
    return this.transaction.run(storeId, async () => {
      for (;;) {
        const existing = await this.identities.findInboundIdentity(storeId, input);
        if (existing) {
          if (!existing.deletedAt) return { id: existing.id, contactId: existing.contactId };
          await this.identities.retireInboundIdentity(storeId, existing.id);
        }
        const now = this.clock.now();
        const identity = await this.identities.createInboundIdentity(storeId, input, now);
        if (!identity) continue;
        await this.outbox.publish({
          type: 'contact.created',
          storeId,
          occurredAt: now.toISOString(),
          payload: { contactId: identity.contactId },
        });
        return identity;
      }
    });
  }

  async list(
    storeId: string,
    query: ContactListQuery,
    { seeFullPhone }: Access,
    actor: Extract<Actor, { kind: 'user' }>,
  ): Promise<ContactListResponse> {
    const { search, ...filter } = query;
    const match = searchFilter(search, seeFullPhone);
    if (match.phone) await this.phoneAccess.checkLimit(storeId, 'lookup', seeFullPhone, actor);
    const rows = await this.contactsRepository.list(storeId, { ...filter, ...match });
    const items = rows
      .slice(0, query.limit)
      .map((contact) => toContactResponse(contact, seeFullPhone));
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
  }

  async getPhoneForSend(storeId: string, id: string): Promise<string | null> {
    const [contact] = await this.contactsRepository.findRecipients(storeId, [id]);
    if (!contact) throw contactError('CONTACT_NOT_FOUND');
    return contact.phone;
  }

  async getById(storeId: string, id: string, access: Access): Promise<ContactDetailResponse> {
    const contact = await this.contactsRepository.findById(storeId, id);
    if (!contact) throw contactError('CONTACT_NOT_FOUND');
    return {
      ...toContactResponse(contact, access.seeFullPhone),
      identities: await this.contactsRepository.findIdentities(storeId, id),
    };
  }

  resolveOrderBuyer(
    storeId: string,
    input: { buyer: CreateOrderInput['buyer']; orderId: string; ownPhone?: string },
    _actor: Actor,
  ): Promise<Pick<Contact, 'id' | 'name'>> {
    return this.transaction.run(storeId, async () => {
      const { buyer, orderId } = input;
      const now = this.clock.now();
      const contact =
        'contactId' in buyer
          ? await this.contactsRepository.findById(storeId, buyer.contactId)
          : await this.contactsRepository.insert(storeId, {
              name: buyer.name,
              phone: null,
              kind: 'customer',
              source: 'manual',
            });
      if (!contact) throw contactError('CONTACT_NOT_FOUND');
      if ('name' in buyer)
        await this.outbox.publish({
          type: 'contact.created',
          storeId,
          occurredAt: now.toISOString(),
          payload: { contactId: contact.id },
        });
      const phone = input.ownPhone ?? ('phone' in buyer ? buyer.phone : undefined);
      if (phone && phone !== contact.phone)
        await this.matchSuggestions.saveOwnPhone(storeId, contact.id, { phone, orderId, now });
      return { id: contact.id, name: contact.name };
    });
  }

  // D27. Returns nothing, so the caller cannot learn who else holds the number.
  captureOwnPhone(
    storeId: string,
    input: { contactId: string; phone: string; orderId?: string; conversationId?: string },
    _actor: Actor,
  ): Promise<void> {
    return this.matchSuggestions.captureOwnPhone(storeId, input);
  }

  async hasOrderPhoneMatch(
    storeId: string,
    {
      buyerContactId,
      recipientPhone,
      isRecipientBuyer,
    }: Pick<OrderDetail, 'buyerContactId' | 'recipientPhone' | 'isRecipientBuyer'>,
    { seeFullPhone }: Access,
  ): Promise<boolean> {
    if (!isRecipientBuyer || !buyerContactId || !seeFullPhone) return false;
    const [match] = await this.orderContacts.findOpenPhoneMatch(
      storeId,
      buyerContactId,
      recipientPhone,
    );
    return match !== undefined;
  }

  // Import undo keeps a contact once a new order makes the imported record useful.
  async markOrderLinked(storeId: string, contactId: string, _actor: Actor): Promise<void> {
    if (!(await this.orderContacts.markOrderLinked(storeId, contactId, this.clock.now())))
      throw contactError('CONTACT_NOT_FOUND');
  }

  async editDetails(
    storeId: string,
    id: string,
    change: UpdateContactInput,
    editor: { access: Access; actor: Actor },
  ): Promise<ContactResponse> {
    const { access, actor } = editor;
    if (change.phone)
      await this.phoneAccess.checkLimit(storeId, 'write', access.seeFullPhone, actor);
    // A typed phone proves nothing, so an edited phone is no longer the verified WhatsApp sender.
    const updated = await this.contactsRepository.update(storeId, id, {
      ...change,
      ...(change.phone && { phoneVerifiedAt: null }),
    });
    if (updated === 'phone_taken') throw contactError('CONTACT_PHONE_TAKEN');
    if (!updated) throw contactError('CONTACT_NOT_FOUND');
    return toContactResponse(updated, access.seeFullPhone);
  }

  findTags(storeId: string, contactId: string): Promise<string[]> {
    return this.contactsRepository.findTags(storeId, contactId);
  }

  // A workflow's tag action. A deleted contact is left as it is.
  changeTag(storeId: string, contactId: string, change: TagChange, _actor: Actor): Promise<void> {
    return this.transaction.run(storeId, async () => {
      const changed = await this.contactsRepository.changeTag(
        storeId,
        contactId,
        change,
        MAX_CONTACT_TAGS,
      );
      if (!changed || change.change !== 'add') return;
      await this.outbox.publish({
        type: 'contact.tag_added',
        storeId,
        occurredAt: this.clock.now().toISOString(),
        payload: { contactId, tag: change.tag },
      });
    });
  }

  birthdayContactIds(
    storeId: string,
    birthday: { month: number; days: number[] },
    after: string | null,
    limit: number,
  ) {
    return this.contactsRepository.birthdayContactIds(storeId, birthday, after, limit);
  }

  // D42: an import never changes the phone, kind, source, verification or consent of a contact the
  // store already has. A filled cell replaces that field and tags are added; `skip` leaves it as it
  // is. A contact this import already added is not written again, so a rerun changes nothing.
  findImportMatches(storeId: string, phones: string[]): Promise<ImportMatch[]> {
    return this.importContacts.findByPhones(storeId, phones);
  }

  saveImportedRows(
    storeId: string,
    importId: string,
    { rows, duplicateMode, whatsappAnswered, matchedContactIds }: ImportContactBatch,
    _actor: Actor,
  ): Promise<ImportedContact[]> {
    return this.transaction.run(storeId, async () => {
      const phones = rows.map((row) => row.phone);
      // A contact created after matching must hit the unique constraint and retry, so its
      // consent is read under the same lock before any imported field can change.
      const existing = (await this.importContacts.findByPhones(storeId, phones)).filter((contact) =>
        matchedContactIds.has(contact.id),
      );
      const byPhone = new Map(existing.map((contact) => [contact.phone, contact]));
      const added = await this.importContacts.insertImported(
        storeId,
        rows
          .filter((row) => !byPhone.has(row.phone))
          .map((row) => ({ ...row, importId, source: 'import', kind: 'customer' })),
      );
      const results: ImportedContact[] = added.map(({ id, phone }) => ({
        contactId: id,
        phone,
        outcome: 'added',
        notChanged: [],
        hasWhatsappNumberMismatch: false,
      }));
      const changes: ImportedChange[] = [];
      for (const row of rows) {
        const contact = byPhone.get(row.phone);
        if (!contact) continue;
        const outcome = importOutcome(contact, importId, duplicateMode);
        const update =
          outcome === 'updated'
            ? importChange(contact, row, whatsappAnswered.has(contact.id))
            : undefined;
        if (update) changes.push(update.change);
        results.push(toImportedContact(contact, row, outcome, update));
      }
      await this.importContacts.updateImported(storeId, changes);
      return results;
    });
  }

  // Consent changes for these contacts wait for each other inside the caller's transaction, so a
  // withdrawal is never overridden by an answer read before it.
  async lockForConsent(storeId: string, ids: string[]): Promise<void> {
    const locked = await this.contactsRepository.lockForConsent(storeId, ids);
    if (locked.length < new Set(ids).size) throw contactError('CONTACT_NOT_FOUND');
  }

  async lockConsentHistory(storeId: string, ids: string[]): Promise<void> {
    const locked = await this.importContacts.lockConsentHistory(storeId, ids);
    if (locked.length < new Set(ids).size) throw contactError('CONTACT_NOT_FOUND');
  }

  async remove(storeId: string, id: string, _actor: Actor): Promise<void> {
    if (!(await this.deletion.remove(storeId, [id])).length)
      throw contactError('CONTACT_NOT_FOUND');
  }

  // The contacts an import added that nobody has edited since, locked until the caller's
  // transaction ends. Call it inside one.
  lockUneditedByImport(
    storeId: string,
    importId: string,
    page: { after?: string; limit: number },
  ): Promise<string[]> {
    return this.contactsRepository.lockUneditedByImport(storeId, importId, page);
  }

  async removeAll(storeId: string, ids: string[], _actor: Actor): Promise<void> {
    await this.deletion.remove(storeId, ids);
  }

  // A deleted contact reads as undefined.
  findRecipient(storeId: string, id: string): Promise<ContactRecipient | undefined> {
    return this.contactsRepository.findRecipient(storeId, id);
  }

  // Deleted contacts are left out.
  findRecipients(storeId: string, ids: string[]): Promise<AudienceRecipient[]> {
    return this.contactsRepository.findRecipients(storeId, ids);
  }

  countMatching(storeId: string, rules: SegmentRules): Promise<number> {
    return this.contactsRepository.countMatching(storeId, rules);
  }

  isMatching(storeId: string, contactId: string, rules: SegmentRules): Promise<boolean> {
    return this.contactsRepository.isMatching(storeId, contactId, rules);
  }

  listIdsMatching(
    storeId: string,
    rules: SegmentRules,
    page: { cursor?: string; limit: number; contactIds?: string[] },
  ): Promise<string[]> {
    return this.contactsRepository.listIdsMatching(storeId, rules, page);
  }
}

export type { TagChange } from './contacts.repository';

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

function importOutcome(
  contact: ImportMatch,
  importId: string,
  duplicateMode: ImportDuplicateMode,
): ImportedContact['outcome'] {
  if (contact.importId === importId) return 'added';
  return duplicateMode === 'update' ? 'updated' : 'skipped';
}

// A saved WhatsApp number is kept, and so is an empty one on a contact with a WhatsApp consent
// answer: empty means "the phone", so filling it would move that answer to a number nobody
// verified. Changing a number stays a profile edit.
function importChange(
  contact: ImportMatch,
  { phone: _phone, ...row }: ContactImportRow,
  whatsappAnswered: boolean,
) {
  const notChanged: ImportedContact['notChanged'] = [];
  const whatsappDiffers = row.whatsappPhone && row.whatsappPhone !== contact.whatsappPhone;
  const whatsappKept = Boolean(contact.whatsappPhone) || whatsappAnswered;
  if (whatsappKept && whatsappDiffers)
    notChanged.push({ field: 'whatsappPhone', message: 'WhatsApp number differs, not changed' });
  const newTags = [...new Set(row.tags ?? [])].filter((tag) => !contact.tags.includes(tag));
  const room = Math.max(0, MAX_CONTACT_TAGS - contact.tags.length);
  if (newTags.length > room)
    notChanged.push({
      field: 'tags',
      message: `${newTags.length - room} tags not added: a customer has at most ${MAX_CONTACT_TAGS}`,
    });
  const change: ImportedChange = {
    ...row,
    id: contact.id,
    whatsappPhone: whatsappKept ? undefined : row.whatsappPhone,
    tags: newTags.slice(0, room),
  };
  return { change, notChanged };
}

function toImportedContact(
  contact: ImportMatch,
  row: ContactImportRow,
  outcome: ImportedContact['outcome'],
  update: ReturnType<typeof importChange> | undefined,
): ImportedContact {
  const destination = update?.change.whatsappPhone ?? contact.whatsappPhone ?? contact.phone;
  return {
    contactId: contact.id,
    phone: contact.phone,
    outcome,
    notChanged: update?.notChanged ?? [],
    hasWhatsappNumberMismatch: destination !== (row.whatsappPhone ?? row.phone),
  };
}

function toContactResponse(contact: Contact, seeFullPhone: boolean): ContactResponse {
  return {
    ...contact,
    phone: contact.phone && !seeFullPhone ? maskPhone(contact.phone) : contact.phone,
    createdAt: contact.createdAt.toISOString(),
  };
}
