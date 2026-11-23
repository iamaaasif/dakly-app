import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { NotificationStreamService } from '../notification-stream.service';
import { StreamInboxOnHandedOver } from './stream-inbox-on-handed-over.job';
import { StreamInboxOnMessageDelivered } from './stream-inbox-on-message-delivered.job';
import { StreamInboxOnMessageFailed } from './stream-inbox-on-message-failed.job';
import { StreamInboxOnMessageRead } from './stream-inbox-on-message-read.job';
import { StreamInboxOnMessageReceived } from './stream-inbox-on-message-received.job';
import { StreamInboxOnMessageSent } from './stream-inbox-on-message-sent.job';

const storeId = randomUUID();
const conversationId = randomUUID();
const messagePayload = {
  messageId: randomUUID(),
  conversationId,
  contactId: randomUUID(),
  channel: 'messenger',
};

// The job data is the event plus the outbox row id, exactly as the relay queues it.
const cases = [
  [StreamInboxOnMessageReceived, 'message.received', messagePayload],
  [StreamInboxOnMessageSent, 'message.sent', messagePayload],
  [StreamInboxOnMessageDelivered, 'message.delivered', messagePayload],
  [StreamInboxOnMessageRead, 'message.read', messagePayload],
  [StreamInboxOnMessageFailed, 'message.failed', messagePayload],
  [StreamInboxOnHandedOver, 'conversation.handed_over', { conversationId, reason: 'complaint' }],
] as const;

describe('stream inbox jobs', () => {
  it.each(cases)('%o announces the chat when the relay queues %s', async (Job, type, payload) => {
    const announceInbox = vi.fn().mockResolvedValue(undefined);
    const job = new Job({ announceInbox } as unknown as NotificationStreamService);
    await job.handle({
      id: randomUUID(),
      storeId,
      type,
      payload,
      occurredAt: new Date().toISOString(),
    });
    expect(announceInbox).toHaveBeenCalledWith(storeId, conversationId);
  });
});
