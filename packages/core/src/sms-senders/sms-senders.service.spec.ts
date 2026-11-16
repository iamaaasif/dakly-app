import { describe, expect, it } from 'vitest';

import type { SmsMessage } from '@dakly/providers/sms/sms-driver';

import type { UsersService } from '../auth/users.service';
import type { Clock } from '../platform/clock';
import type { SmsService } from '../sms/sms.service';
import type { SmsSender, SmsSenderDecision, SmsSendersRepository } from './sms-senders.repository';
import { SmsSendersService } from './sms-senders.service';

const storeId = '01890000-0000-7000-8000-0000000000a1';
const otherStoreId = '01890000-0000-7000-8000-0000000000b2';
const userId = '01890000-0000-7000-8000-0000000000c3';
const staff = { kind: 'staff', staffUserId: '01890000-0000-7000-8000-0000000000d4' } as const;
const now = new Date('2026-11-16T10:00:00.000Z');

// Holds one store's rows and applies the same guards as the SQL: one active sender, guarded update.
class FakeSmsSendersRepository {
  readonly rows = new Map<string, SmsSender & { storeId: string }>();

  async insert(store: string, senderName: string) {
    const active = [...this.rows.values()].some(
      (row) => row.storeId === store && row.status !== 'rejected',
    );
    if (active) return undefined;
    const id = `01890000-0000-7000-8000-00000000000${this.rows.size + 1}`;
    const row = {
      id,
      storeId: store,
      senderName,
      status: 'requested' as const,
      rejectionReason: null,
      createdAt: now,
      decidedAt: null,
    };
    this.rows.set(id, row);
    return withoutStore(row);
  }

  async findById(store: string, id: string) {
    const row = this.rows.get(id);
    return row?.storeId === store ? withoutStore(row) : undefined;
  }

  async decide(store: string, id: string, from: readonly string[], decision: SmsSenderDecision) {
    const row = this.rows.get(id);
    if (row?.storeId !== store || !from.includes(row.status)) return undefined;
    Object.assign(row, decision);
    return withoutStore(row);
  }
}

function withoutStore({ storeId: _storeId, ...sender }: SmsSender & { storeId: string }) {
  return sender;
}

function setup(member = { phone: '01712345678' as string | null, isPhoneVerified: true }) {
  const repository = new FakeSmsSendersRepository();
  const sent: SmsMessage[] = [];
  const sms = {
    send: async (message: SmsMessage) => {
      sent.push(message);
      return { providerMessageId: 'fake-1' };
    },
  };
  const users = { profile: async () => ({ id: userId, name: 'নুসরাত', ...member }) };
  const service = new SmsSendersService(
    repository as unknown as SmsSendersRepository,
    sms as unknown as SmsService,
    users as unknown as UsersService,
    { now: () => now } as Clock,
  );
  const request = (store = storeId) =>
    service.request(store, { senderName: 'Nusrat Fab' }, { kind: 'user', userId });
  const decide = (id: string, status: 'approved' | 'rejected', store = storeId) =>
    service.decideRequest(store, id, { status, reason: 'Trade licence name differs' }, staff);
  return { service, sent, request, decide };
}

describe('SmsSendersService', () => {
  it('refuses a second request while the first is pending', async () => {
    const { request } = setup();
    await request();

    await expect(request()).rejects.toMatchObject({ code: 'SMS_SENDER_ID_ALREADY_ACTIVE' });
  });

  it('keeps the reason on a rejection and clears it on an approval', async () => {
    const { request, decide } = setup();
    const first = await request();

    expect(await decide(first.id, 'rejected')).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Trade licence name differs',
      decidedAt: now.toISOString(),
    });
    const second = await request();
    expect(await decide(second.id, 'approved')).toMatchObject({
      status: 'approved',
      rejectionReason: null,
    });
  });

  it('answers not found for another store’s request', async () => {
    const { request, decide } = setup();
    const { id } = await request();

    await expect(decide(id, 'approved', otherStoreId)).rejects.toMatchObject({
      code: 'SMS_SENDER_ID_NOT_FOUND',
    });
  });

  it('refuses to decide a request twice', async () => {
    const { request, decide } = setup();
    const { id } = await request();
    await decide(id, 'approved');

    await expect(decide(id, 'rejected')).rejects.toMatchObject({
      code: 'SMS_SENDER_ID_ALREADY_DECIDED',
    });
  });

  it('sends a test only from an approved name', async () => {
    const { service, sent, request } = setup();
    const { id } = await request();

    await expect(service.sendTest(storeId, id, userId)).rejects.toMatchObject({
      code: 'SMS_SENDER_ID_NOT_APPROVED',
    });
    expect(sent).toEqual([]);
  });

  it('sends a test to the member’s own phone from the approved name', async () => {
    const { service, sent, request, decide } = setup();
    const { id } = await request();
    await decide(id, 'approved');

    await service.sendTest(storeId, id, userId);

    expect(sent).toEqual([
      {
        to: '01712345678',
        text: 'This is a test SMS from Nusrat Fab on Dakly.',
        sender: 'Nusrat Fab',
      },
    ]);
  });

  it('refuses a test for a member without a verified phone', async () => {
    const { service, sent, request, decide } = setup({
      phone: '01712345678',
      isPhoneVerified: false,
    });
    const { id } = await request();
    await decide(id, 'approved');

    await expect(service.sendTest(storeId, id, userId)).rejects.toMatchObject({
      code: 'SMS_SENDER_TEST_PHONE_REQUIRED',
    });
    expect(sent).toEqual([]);
  });
});
