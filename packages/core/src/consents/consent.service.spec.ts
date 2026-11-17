import { describe, expect, it, vi } from 'vitest';

import type { ContactsService } from '../contacts/contacts.service';
import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { OutboxService } from '../platform/outbox/outbox.service';
import { ConsentService } from './consent.service';
import type { ConsentsRepository, NewConsent } from './consents.repository';

const STORE_ID = '7f1d3a52-4c55-4a8e-9a43-2a1f0c7d9b10';
const owner = { kind: 'user', userId: '0b8f3c1e-5d2a-4f6b-9c7e-1a2b3c4d5e6f' } as const;
const capturedAt = new Date('2026-11-17T04:30:00Z');

function serviceWith(current: { contactId: string; status: 'granted' | 'withdrawn' }[]) {
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
    {} as ContactsService,
    { run: (_storeId: string, work: () => Promise<unknown>) => work() } as StoreTransaction,
    { publishAll: vi.fn() } as unknown as OutboxService,
    { now: () => capturedAt } as Clock,
  );
  return { service, inserted };
}

describe('ConsentService.grantFromImport', () => {
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
        capturedAt,
        capturedByUserId: owner.userId,
      },
    ]);
  });

  it('refuses more contacts than one batch', async () => {
    const { service } = serviceWith([]);
    const contactIds = Array.from({ length: 501 }, (_, index) => `contact-${index}`);

    await expect(
      service.grantFromImport(STORE_ID, { contactIds, channel: 'sms', evidence: 'সই' }, owner),
    ).rejects.toMatchObject({ code: 'CONSENT_AUDIENCE_TOO_MANY' });
  });
});
