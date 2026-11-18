import { describe, expect, it, vi } from 'vitest';

import type { ContactsService } from '../contacts/contacts.service';
import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { OutboxService } from '../platform/outbox/outbox.service';
import { ConsentService } from './consent.service';
import type { Consent, ConsentsRepository, NewConsent } from './consents.repository';

const IMPORT_ID = '019c01ea-cf15-7d31-a7f5-d73d66007ad7';
const CONTACT_ID = '019c01ea-cf15-7d31-a7f5-d73d66007ad8';
const STORE_ID = '7f1d3a52-4c55-4a8e-9a43-2a1f0c7d9b10';
const owner = { kind: 'user', userId: '0b8f3c1e-5d2a-4f6b-9c7e-1a2b3c4d5e6f' } as const;
const capturedAt = new Date('2026-11-17T04:30:00Z');

function serviceWith(
  current: { contactId: string; status: 'granted' | 'withdrawn' | 'not_answered' }[],
) {
  const inserted: NewConsent[] = [];
  const repository = {
    listCurrent: async () => current.map((row) => ({ ...row, source: 'manual', capturedAt })),
    insertAll: async (_storeId: string, rows: NewConsent[]) => {
      inserted.push(...rows);
      return rows.map((row, index) => ({ ...row, id: `consent-${index}` }));
    },
  };
  const service = new ConsentService(
    repository as unknown as ConsentsRepository,
    { lockForConsent: async () => undefined } as unknown as ContactsService,
    { run: (_storeId: string, work: () => Promise<unknown>) => work() } as StoreTransaction,
    { publishAll: vi.fn() } as unknown as OutboxService,
    { now: () => capturedAt } as Clock,
  );
  return { service, inserted };
}

describe('ConsentService', () => {
  it('treats an undone answer like no answer when importing again', async () => {
    const { service, inserted } = serviceWith([{ contactId: CONTACT_ID, status: 'not_answered' }]);
    const result = await service.grantFromImport(
      STORE_ID,
      { contactIds: [CONTACT_ID], channel: 'sms', evidence: 'সই', importId: IMPORT_ID },
      owner,
    );
    expect(result).toEqual({ withdrawnContactIds: [] });
    expect(inserted).toEqual([
      expect.objectContaining({ contactId: CONTACT_ID, status: 'granted' }),
    ]);
  });

  it('grants only contacts with no answer and returns the ones who withdrew', async () => {
    const { service, inserted } = serviceWith([
      { contactId: 'granted-before', status: 'granted' },
      { contactId: 'withdrew', status: 'withdrawn' },
    ]);

    const result = await service.grantFromImport(
      STORE_ID,
      {
        contactIds: ['new', 'granted-before', 'withdrew'],
        channel: 'sms',
        evidence: 'দোকানের খাতায় সই',
        importId: IMPORT_ID,
      },
      owner,
    );

    expect(result).toEqual({ withdrawnContactIds: ['withdrew'] });
    expect(inserted).toEqual([
      {
        contactId: 'new',
        channel: 'sms',
        status: 'granted',
        source: 'import',
        evidence: 'দোকানের খাতায় সই',
        importId: IMPORT_ID,
        capturedAt,
        capturedByUserId: owner.userId,
      },
    ]);
  });

  it('refuses more contacts than one batch', async () => {
    const { service } = serviceWith([]);
    const contactIds = Array.from({ length: 501 }, (_, index) => `contact-${index}`);

    await expect(
      service.grantFromImport(
        STORE_ID,
        { contactIds, channel: 'sms', evidence: 'সই', importId: IMPORT_ID },
        owner,
      ),
    ).rejects.toMatchObject({ code: 'CONSENT_AUDIENCE_TOO_MANY' });
  });

  it('appends an unanswered row only for import grants with no later answer', async () => {
    const grant: Consent = {
      id: '019c01ea-cf15-7d31-a7f5-d73d66007ad9',
      contactId: CONTACT_ID,
      channel: 'sms',
      status: 'granted',
      source: 'import',
      capturedAt,
    };
    const inserted: NewConsent[] = [];
    const events: unknown[] = [];
    const repository = {
      listImportGrants: async () => [
        grant,
        {
          ...grant,
          id: '019c01ea-cf15-7d31-a7f5-d73d66007ada',
          contactId: '019c01ea-cf15-7d31-a7f5-d73d66007adb',
        },
      ],
      listUnchangedGrants: async () => [grant],
      insertAll: async (_storeId: string, rows: NewConsent[]) => {
        inserted.push(...rows);
        return rows.map((row) => ({ ...row, id: '019c01ea-cf15-7d31-a7f5-d73d66007adc' }));
      },
    };
    const service = new ConsentService(
      repository as unknown as ConsentsRepository,
      { lockConsentHistory: async () => undefined } as unknown as ContactsService,
      { run: (_storeId: string, work: () => Promise<unknown>) => work() } as StoreTransaction,
      {
        publishAll: async (rows: unknown[]) => {
          events.push(...rows);
        },
      } as unknown as OutboxService,
      { now: () => capturedAt } as Clock,
    );
    expect(
      await service.restoreImportGrants(STORE_ID, IMPORT_ID, undefined, { kind: 'system' }),
    ).toEqual({ after: '019c01ea-cf15-7d31-a7f5-d73d66007ada', complete: true });
    expect(inserted).toEqual([
      {
        contactId: CONTACT_ID,
        channel: 'sms',
        status: 'not_answered',
        source: 'import',
        evidence: `Import ${IMPORT_ID} undone`,
        capturedAt,
        capturedByUserId: null,
      },
    ]);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'consent.changed',
        payload: expect.objectContaining({ status: 'not_answered', source: 'import' }),
      }),
    ]);
  });
});
