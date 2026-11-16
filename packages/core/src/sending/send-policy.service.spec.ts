import { beforeEach, describe, expect, it } from 'vitest';

import type { ConsentService } from '../consents/consent.service';
import type { ContactsService } from '../contacts/contacts.service';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { StoresService } from '../stores/stores.service';
import { type SendRequest, SendPolicyService } from './send-policy.service';
import type { SendingRepository } from './sending.repository';

const STORE_ID = '0193a3c4-5d1e-7b8f-9a0b-1c2d3e4f5a6b';
const CONTACT_ID = '0193a3c4-5d1e-7b8f-9a0b-2c3d4e5f6a7b';
// Asia/Dhaka is UTC+6 all year, so 12:00 in Dhaka is 06:00 UTC.
const NOON_DHAKA = new Date('2026-11-16T06:00:00Z');
const HOUR = 60 * 60 * 1000;

type MarketingSend = { channel: string; sentAt: Date };
type Contact = {
  kind: 'customer' | 'lead' | 'not_customer';
  isBlocked: boolean;
  isOverPlanLimit: boolean;
  hasPhone: boolean;
};

describe('SendPolicyService', () => {
  let contact: Contact | undefined;
  let consent: 'granted' | 'withdrawn' | undefined;
  let sends: MarketingSend[];
  let isTransactionOpen: boolean;
  let service: SendPolicyService;

  beforeEach(() => {
    contact = { kind: 'customer', isBlocked: false, isOverPlanLimit: false, hasPhone: true };
    isTransactionOpen = true;
    consent = 'granted';
    sends = [];
    // The batch reads answer the same for every contact id they are given.
    const contacts = {
      findRecipient: async () => contact,
      findRecipients: async (_storeId: string, ids: string[]) =>
        contact
          ? ids.map((id) => ({ ...contact!, id, phone: contact!.hasPhone ? '01712345678' : null }))
          : [],
    };
    const consents = {
      current: async () => (consent ? [{ contactId: CONTACT_ID, status: consent }] : []),
      currentForAudience: async (_storeId: string, ids: string[]) =>
        consent ? ids.map((contactId) => ({ contactId, status: consent })) : [],
    };
    const stores = {
      sendingSettings: async () => ({
        timeZone: 'Asia/Dhaka',
        quietHours: { startHour: 21, endHour: 9 },
        frequencyCap: { perChannelPerDay: 1, perSevenDays: 3 },
      }),
    };
    // Mirrors the repository's window: after the first date, up to and including the second.
    const repository = {
      lockContact: async () => undefined,
      listMarketingSends: async (_storeId: string, ids: string[], after: Date, until: Date) =>
        ids.flatMap((contactId) =>
          sends
            .filter((send) => send.sentAt > after && send.sentAt <= until)
            .map((send) => ({ ...send, contactId })),
        ),
    };
    service = new SendPolicyService(
      contacts as unknown as ContactsService,
      consents as unknown as ConsentService,
      stores as unknown as StoresService,
      repository as unknown as SendingRepository,
      { isOpen: () => isTransactionOpen } as unknown as StoreTransaction,
    );
  });

  function request(change: Partial<SendRequest> = {}): SendRequest {
    return {
      contactId: CONTACT_ID,
      channel: 'sms',
      category: 'marketing',
      at: NOON_DHAKA,
      ...change,
    };
  }

  function sentBefore(hours: number, channel = 'sms'): MarketingSend {
    return { channel, sentAt: new Date(NOON_DHAKA.getTime() - hours * HOUR) };
  }

  it('sends marketing SMS to a consented customer in the afternoon', async () => {
    expect(await service.check(STORE_ID, request())).toEqual({ action: 'send' });
  });

  const skipCases = [
    ['no_address', 'a deleted contact', () => (contact = undefined), {}],
    ['no_address', 'an SMS to a contact with no phone', () => (contact!.hasPhone = false), {}],
    ['blocked', 'a blocked contact', () => (contact!.isBlocked = true), {}],
    ['not_customer', 'a Not a customer contact', () => (contact!.kind = 'not_customer'), {}],
    [
      'over_plan_limit',
      'a contact past the plan limit',
      () => (contact!.isOverPlanLimit = true),
      {},
    ],
    ['no_consent', 'a contact who never answered', () => (consent = undefined), {}],
    ['no_consent', 'a withdrawal after approval', () => (consent = 'withdrawn'), {}],
    [
      'window_closed',
      'Messenger before inbound messages exist',
      () => {},
      { channel: 'messenger' },
    ],
    ['window_closed', 'WhatsApp before templates exist', () => {}, { channel: 'whatsapp' }],
    ['frequency_cap', 'a second SMS within 24 hours', () => sends.push(sentBefore(23)), {}],
    [
      'frequency_cap',
      'a fourth message in 7 days across channels',
      () => sends.push(sentBefore(30), sentBefore(60, 'whatsapp'), sentBefore(100, 'messenger')),
      {},
    ],
  ] as const;

  it.each(skipCases)('skips as %s for %s', async (reason, _case, arrange, change) => {
    arrange();

    expect(await service.check(STORE_ID, request(change))).toEqual({ action: 'skip', reason });
  });

  it.each([
    ...skipCases,
    ['send', 'a consented customer', () => {}, {}],
    [
      'send',
      'a transactional SMS without consent',
      () => (consent = undefined),
      { category: 'transactional' },
    ],
    ['defer', 'marketing in quiet hours', () => {}, { at: new Date('2026-11-16T16:00:00Z') }],
  ] as const)(
    'decides an audience as check does: %s for %s',
    async (_result, _case, arrange, change) => {
      arrange();
      const { channel, category, at } = request(change);
      const ids = [CONTACT_ID, '0193a3c4-5d1e-7b8f-9a0b-3c4d5e6f7a8b'];

      const audience = await service.checkAudience(STORE_ID, {
        contactIds: ids,
        channel,
        category,
        at,
      });

      const decision = await service.check(STORE_ID, request(change));
      expect(audience).toEqual(
        ids.map((contactId) => ({
          contactId,
          phone: contact?.hasPhone ? '01712345678' : null,
          decision,
        })),
      );
    },
  );

  it('checks an audience outside a store transaction', async () => {
    isTransactionOpen = false;

    expect(
      await service.checkAudience(STORE_ID, {
        contactIds: [CONTACT_ID],
        channel: 'sms',
        category: 'marketing',
        at: NOON_DHAKA,
      }),
    ).toEqual([{ contactId: CONTACT_ID, phone: '01712345678', decision: { action: 'send' } }]);
  });

  it('sends again once the last SMS is 24 hours old and the week has room', async () => {
    sends.push(sentBefore(24), sentBefore(30, 'messenger'));

    expect(await service.check(STORE_ID, request())).toEqual({ action: 'send' });
  });

  it('does not count a message on another channel toward the daily cap', async () => {
    sends.push(sentBefore(1, 'messenger'));

    expect(await service.check(STORE_ID, request())).toEqual({ action: 'send' });
  });

  it.each([
    ['20:59 sends', '2026-11-16T14:59:00Z', { action: 'send' }],
    [
      '21:00 defers to 09:00 the next day',
      '2026-11-16T15:00:00Z',
      { action: 'defer', until: new Date('2026-11-17T03:00:00Z') },
    ],
    [
      '23:30 on 31 December defers to 09:00 on 1 January',
      '2026-12-31T17:30:00Z',
      { action: 'defer', until: new Date('2027-01-01T03:00:00Z') },
    ],
    [
      '03:15:20 defers to 09:00 the same day',
      '2026-11-16T21:15:20.500Z',
      { action: 'defer', until: new Date('2026-11-17T03:00:00Z') },
    ],
    ['09:00 sends', '2026-11-17T03:00:00Z', { action: 'send' }],
  ])('in Dhaka time, %s', async (_case, at, decision) => {
    expect(await service.check(STORE_ID, request({ at: new Date(at) }))).toEqual(decision);
  });

  it('checks quiet hours before the cap', async () => {
    sends.push(sentBefore(1));

    expect(
      await service.check(STORE_ID, request({ at: new Date('2026-11-16T15:00:00Z') })),
    ).toEqual({ action: 'defer', until: new Date('2026-11-17T03:00:00Z') });
  });

  it('sends transactional SMS in quiet hours, over the cap and without marketing consent', async () => {
    consent = 'withdrawn';
    contact!.kind = 'not_customer';
    sends.push(sentBefore(1), sentBefore(2), sentBefore(3));

    expect(
      await service.check(
        STORE_ID,
        request({ category: 'transactional', at: new Date('2026-11-16T16:00:00Z') }),
      ),
    ).toEqual({ action: 'send' });
  });

  it.each(['transactional', 'staff_reply'] as const)(
    'still skips a blocked contact for %s',
    async (category) => {
      contact!.isBlocked = true;

      expect(await service.check(STORE_ID, request({ category }))).toEqual({
        action: 'skip',
        reason: 'blocked',
      });
    },
  );

  it('skips a transactional SMS to a contact with no phone', async () => {
    contact!.hasPhone = false;

    expect(await service.check(STORE_ID, request({ category: 'transactional' }))).toEqual({
      action: 'skip',
      reason: 'no_address',
    });
  });

  it('lets a staff reply through after STOP', async () => {
    consent = 'withdrawn';

    expect(await service.check(STORE_ID, request({ category: 'staff_reply' }))).toEqual({
      action: 'send',
    });
  });

  it('refuses a marketing check outside a store transaction', async () => {
    isTransactionOpen = false;

    await expect(service.check(STORE_ID, request())).rejects.toMatchObject({
      code: 'STORE_TRANSACTION_REQUIRED',
    });
  });

  it('checks a transactional send outside a store transaction', async () => {
    isTransactionOpen = false;

    expect(await service.check(STORE_ID, request({ category: 'transactional' }))).toEqual({
      action: 'send',
    });
  });
});
