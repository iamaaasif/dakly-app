import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type { ConsentChannel } from '@dakly/contracts/contacts';
import type {
  CustomerActivityResponse,
  CustomerCampaignResponse,
  CustomerNoteResponse,
  CustomerOrderResponse,
  CustomerPage,
  CustomerProfilePageQuery,
  CustomerSummaryResponse,
  MarketingPreferenceResponse,
  SetMarketingConsentInput,
} from '@dakly/contracts/customer-profile';
import { maskPhone } from '@dakly/contracts/phone';
import type { StoreAccess } from '@dakly/contracts/team';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { ConsentService } from '../consents/consent.service';
import { ContactsService } from '../contacts/contacts.service';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { ContactNotesRepository } from './contact-notes.repository';
import { customerProfileError } from './customer-profile.errors';
import { CustomerProfileRepository, type PageAfter } from './customer-profile.repository';

type Access = Pick<StoreAccess, 'seeFullPhone'>;
type Actor = AuditEntry['actor'];

const PHOTO_LINK_SECONDS = 15 * 60;
// A customer's notes are read whole; the screen shows them in one list.
const NOTES_LIMIT = 100;
const DEFAULT_CONSENT_NOTE = 'Changed on the customer profile';
const preferenceChannels = ['whatsapp', 'sms', 'email'] as const satisfies ConsentChannel[];

@Injectable()
export class CustomerProfileService {
  constructor(
    @Inject(CustomerProfileRepository) private readonly repository: CustomerProfileRepository,
    @Inject(ContactNotesRepository) private readonly notes: ContactNotesRepository,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(ConsentService) private readonly consents: ConsentService,
    @Inject(FILE_STORAGE_DRIVER) private readonly storage: FileStorageDriver,
  ) {}

  async summary(
    storeId: string,
    contactId: string,
    access: Access,
  ): Promise<CustomerSummaryResponse> {
    const contact = await this.contacts.getById(storeId, contactId, access);
    const fields = await this.repository.fields(storeId, contactId);
    if (!fields) throw customerProfileError('CUSTOMER_PROFILE_NOT_FOUND');
    const netSpend = Number(fields.netSpendPoisha);
    return {
      id: contact.id,
      name: contact.name,
      kind: contact.kind,
      lifecycleStage: fields.lifecycleStage ?? 'none',
      phone: contact.phone,
      whatsappPhone:
        fields.whatsappPhone && !access.seeFullPhone
          ? maskPhone(fields.whatsappPhone)
          : fields.whatsappPhone,
      email: fields.email,
      address: fields.address,
      district: fields.district,
      source: fields.source,
      tags: contact.tags,
      favouriteCategory: fields.favouriteCategory,
      createdAt: contact.createdAt,
      totalSpendPoisha: netSpend,
      ordersCount: fields.ordersCount,
      averageOrderPoisha: fields.ordersCount > 0 ? Math.round(netSpend / fields.ordersCount) : null,
      firstPurchaseAt: fields.firstOrderAt,
      lastPurchaseAt: fields.lastOrderAt,
      lifetimeValuePoisha: fields.ordersCount > 0 ? netSpend : null,
    };
  }

  async orders(
    storeId: string,
    contactId: string,
    access: Access,
    query: CustomerProfilePageQuery,
  ): Promise<CustomerPage<CustomerOrderResponse>> {
    await this.contacts.getById(storeId, contactId, access);
    const rows = await this.repository.orders(
      storeId,
      contactId,
      parseCursor(query.cursor),
      query.limit,
    );
    return page(
      rows,
      query.limit,
      (row) => row.id,
      (row) => ({
        id: row.id,
        number: row.number,
        createdAt: row.at,
        source: row.source,
        stage: row.stage,
        paymentStatus: row.paymentStatus,
        totalPoisha: Number(row.totalPoisha),
        firstItemName: row.firstItemName ?? '',
        firstItemVariantTitle: row.firstItemVariantTitle ?? '',
        otherItemCount: row.otherItemCount,
        photoUrl: row.photoKey
          ? this.storage.createDownloadUrl(row.photoKey, PHOTO_LINK_SECONDS)
          : null,
      }),
    );
  }

  async activity(
    storeId: string,
    contactId: string,
    access: Access,
    query: CustomerProfilePageQuery,
  ): Promise<CustomerPage<CustomerActivityResponse>> {
    await this.contacts.getById(storeId, contactId, access);
    const rows = await this.repository.activity(
      storeId,
      contactId,
      parseCursor(query.cursor),
      query.limit,
    );
    return page(
      rows,
      query.limit,
      (row) => row.key,
      (row) => ({
        id: row.key,
        kind: row.kind,
        at: row.at,
        subject: row.subject,
        channel: row.channel,
        consentStatus: row.consentStatus,
        consentSource: row.consentSource,
      }),
    );
  }

  async campaigns(
    storeId: string,
    contactId: string,
    access: Access,
    query: CustomerProfilePageQuery,
  ): Promise<CustomerPage<CustomerCampaignResponse>> {
    await this.contacts.getById(storeId, contactId, access);
    const rows = await this.repository.campaigns(
      storeId,
      contactId,
      parseCursor(query.cursor),
      query.limit,
    );
    return page(
      rows,
      query.limit,
      (row) => row.recipientId,
      (row) => row,
    );
  }

  async listNotes(
    storeId: string,
    contactId: string,
    access: Access,
  ): Promise<CustomerNoteResponse[]> {
    await this.contacts.getById(storeId, contactId, access);
    return (await this.notes.list(storeId, contactId, NOTES_LIMIT)).map(toNoteResponse);
  }

  async addNote(
    storeId: string,
    contactId: string,
    body: string,
    { access, userId }: { access: Access; userId: string },
  ): Promise<CustomerNoteResponse> {
    await this.contacts.getById(storeId, contactId, access);
    return toNoteResponse(await this.notes.insert(storeId, contactId, body, userId));
  }

  async marketingPreferences(
    storeId: string,
    contactId: string,
    access: Access,
  ): Promise<MarketingPreferenceResponse[]> {
    await this.contacts.getById(storeId, contactId, access);
    return this.readPreferences(storeId, contactId);
  }

  // The consent service keeps every answer as a new row and announces it, so each switch is
  // logged with who made it and when.
  async switchMarketing(
    storeId: string,
    contactId: string,
    change: SetMarketingConsentInput & { channel: 'whatsapp' | 'sms' },
    { access, actor }: { access: Access; actor: Actor },
  ): Promise<MarketingPreferenceResponse[]> {
    await this.contacts.getById(storeId, contactId, access);
    await this.consents.recordStaffAnswer(
      storeId,
      contactId,
      {
        channel: change.channel,
        status: change.subscribed ? 'granted' : 'withdrawn',
        note: change.note ?? DEFAULT_CONSENT_NOTE,
      },
      actor,
    );
    return this.readPreferences(storeId, contactId);
  }

  private async readPreferences(storeId: string, contactId: string) {
    return Promise.all(
      preferenceChannels.map(async (channel): Promise<MarketingPreferenceResponse> => {
        const [current] = await this.consents.current(storeId, [contactId], channel);
        return {
          channel: channel as MarketingPreferenceResponse['channel'],
          status: current?.status ?? 'not_answered',
          source: current?.source ?? null,
          changedAt: current?.capturedAt.toISOString() ?? null,
          canSwitch: channel !== 'email',
        };
      }),
    );
  }
}

function parseCursor(cursor: string | undefined): PageAfter | undefined {
  if (!cursor) return undefined;
  const split = cursor.indexOf('|');
  return { at: cursor.slice(0, split), key: cursor.slice(split + 1) };
}

// The query reads one row more than the page; that row only says whether another page exists.
function page<Row extends { at: string }, Item>(
  rows: Row[],
  limit: number,
  keyOf: (row: Row) => string,
  toItem: (row: Row) => Item,
): CustomerPage<Item> {
  const shown = rows.slice(0, limit);
  const last = shown.at(-1);
  return {
    items: shown.map(toItem),
    nextCursor: rows.length > limit && last ? `${last.at}|${keyOf(last)}` : null,
  };
}

function toNoteResponse(note: {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: Date;
}): CustomerNoteResponse {
  return { ...note, createdAt: note.createdAt.toISOString() };
}
