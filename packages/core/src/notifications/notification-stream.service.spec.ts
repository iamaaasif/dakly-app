import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import type { NotificationResponse } from '@dakly/contracts/notifications';

import type { ValkeyClient } from '../platform/cache/valkey-client';
import type { AccountTransaction } from '../platform/database/account-transaction';
import type { SessionsService } from '../sessions/sessions.service';
import type { TeamService } from '../team/team.service';
import {
  NotificationStreamService,
  STREAM_SENT_IDS_LIMIT,
  type StreamMessage,
} from './notification-stream.service';
import type { NotificationsService } from './notifications.service';

const storeId = randomUUID();
const userId = randomUUID();

const card = (id: string): NotificationResponse => ({
  id,
  type: 'conversation.handed_over',
  category: 'fix_now',
  priority: 0,
  title: 'A chat needs a person',
  body: 'রিনা asked about delivery charge',
  actionUrl: '/chats',
  status: 'new',
  snoozedUntil: null,
  createdAt: '2026-11-16T04:00:00.000Z',
});

function openStream(missed: string[] = []) {
  const channel = Object.assign(new EventEmitter(), {
    subscribe: async () => 1,
    unsubscribe: async () => 1,
  });
  const service = new NotificationStreamService(
    { connection: { duplicate: () => channel } } as unknown as ValkeyClient,
    {
      findForUser: async (_storeId: string, _userId: string, id: string) => card(id),
      listCreatedAfter: async () => missed.map(card),
    } as unknown as NotificationsService,
    {} as SessionsService,
    {} as TeamService,
    {} as AccountTransaction,
  );
  const ids: string[] = [];
  const inboxSignals: string[] = [];
  const subscription = service
    .open({ storeId, userId, sessionId: randomUUID() }, missed.length ? randomUUID() : undefined)
    .subscribe((message: StreamMessage) => {
      if ('id' in message) ids.push(message.id);
      else if ('type' in message) inboxSignals.push(JSON.stringify(message.data));
    });
  const announce = (id: string) =>
    channel.emit('message', `notifications:${storeId}`, `${id} ${userId}`);
  const announceInbox = (conversationId: string) =>
    channel.emit('message', `inbox:${storeId}`, conversationId);
  return { ids, inboxSignals, announce, announceInbox, close: () => subscription.unsubscribe() };
}

describe('NotificationStreamService', () => {
  it("tells an open stream that its shop's chats changed", async () => {
    const { inboxSignals, announceInbox, close } = openStream();
    await vi.waitFor(() => expect(inboxSignals).toEqual([]));
    const conversationId = randomUUID();
    announceInbox(conversationId);
    await vi.waitFor(() => expect(inboxSignals).toEqual([JSON.stringify({ conversationId })]));
    close();
  });

  it('sends a replayed row once when the relay also announces it', async () => {
    const missed = randomUUID();
    const stream = openStream([missed]);
    await vi.waitFor(() => expect(stream.ids).toEqual([missed]));
    stream.announce(missed);
    stream.announce(missed);
    const live = randomUUID();
    stream.announce(live);
    await vi.waitFor(() => expect(stream.ids).toEqual([missed, live]));
    stream.close();
  });

  it('remembers only the most recent ids it sent', async () => {
    const stream = openStream();
    await new Promise((resolve) => setImmediate(resolve));
    const sent = Array.from({ length: STREAM_SENT_IDS_LIMIT + 1 }, () => randomUUID());
    sent.forEach(stream.announce);
    await vi.waitFor(() => expect(stream.ids).toHaveLength(sent.length));
    // The oldest id was forgotten, so a repeat of it goes out again; a recent repeat does not.
    stream.announce(sent.at(-1)!);
    stream.announce(sent[0]!);
    await vi.waitFor(() => expect(stream.ids).toHaveLength(sent.length + 1));
    await new Promise((resolve) => setImmediate(resolve));
    expect(stream.ids).toEqual([...sent, sent[0]]);
    stream.close();
  });
});
