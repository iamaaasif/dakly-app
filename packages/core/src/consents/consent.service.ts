import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  ConsentChannel,
  ConsentResponse,
  RecordConsentInput,
} from '@dakly/contracts/contacts';

import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { consentError, MAX_CONSENT_CONTACTS } from './consents.errors';
import { type Consent, ConsentsRepository, type NewConsent } from './consents.repository';

type RecordConsentChange = Pick<
  NewConsent,
  'contactId' | 'channel' | 'status' | 'source' | 'evidence'
>;

const STAFF_OPT_IN_CHANNELS: ConsentChannel[] = ['whatsapp', 'sms'];

@Injectable()
export class ConsentService {
  constructor(
    @Inject(ConsentsRepository) private readonly repository: ConsentsRepository,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // Consent history is evidence: every answer is a new row, and the latest row per channel wins.
  record(
    storeId: string,
    change: RecordConsentChange,
    actor: AuditEntry['actor'],
  ): Promise<ConsentResponse> {
    return this.transaction.run(storeId, async () => {
      await this.contacts.assertContactExists(storeId, change.contactId);
      const capturedAt = this.clock.now();
      const consent = await this.repository.insert(storeId, {
        ...change,
        capturedAt,
        capturedByUserId: actor.kind === 'user' ? actor.userId : null,
      });
      await this.outbox.publish({
        type: 'consent.changed',
        storeId,
        occurredAt: capturedAt.toISOString(),
        payload: {
          consentId: consent.id,
          contactId: consent.contactId,
          channel: consent.channel,
          status: consent.status,
          source: consent.source,
        },
      });
      return toConsentResponse(consent);
    });
  }

  // Staff type how the customer agreed or refused; that note is the evidence.
  async recordStaffAnswer(
    storeId: string,
    contactId: string,
    { channel, status, note }: RecordConsentInput,
    actor: AuditEntry['actor'],
  ): Promise<ConsentResponse> {
    // A Messenger or Instagram opt-in must come from the customer, so a staff note cannot grant it.
    if (status === 'granted' && !STAFF_OPT_IN_CHANNELS.includes(channel))
      throw consentError('CONSENT_OPT_IN_NEEDS_CUSTOMER');
    return this.record(
      storeId,
      { contactId, channel, status, source: 'manual', evidence: note },
      actor,
    );
  }

  // A contact with no row has never answered on this channel and is not in the result.
  current(storeId: string, contactIds: string[], channel: ConsentChannel) {
    if (contactIds.length > MAX_CONSENT_CONTACTS) throw consentError('CONSENT_CONTACTS_TOO_MANY');
    return this.repository.listCurrent(storeId, contactIds, channel);
  }
}

function toConsentResponse(consent: Consent): ConsentResponse {
  return { ...consent, capturedAt: consent.capturedAt.toISOString() };
}
