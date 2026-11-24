import { isAwaitingReading, messageAttachmentsSchema } from '@dakly/contracts/chats';

import type { InboxService } from '../messaging/inbox.service';
import { MINUTE_MS } from '../platform/time';

type Turn = NonNullable<Awaited<ReturnType<InboxService['aiReplyTurn']>>>;

const MEDIA_WAIT_LIMIT_MS = 3 * MINUTE_MS;

// The latest sender's messages that arrived close together, answered as one turn.
export function burstText(turn: Turn, delay: number, now: Date) {
  const texts: string[] = [];
  const messageIds: string[] = [];
  let awaitingMedia = false;
  let previous = turn.latest.createdAt.getTime();
  for (const message of turn.inbound) {
    if (message.senderIdentityId !== turn.latest.senderIdentityId) break;
    const receivedAt = message.createdAt.getTime();
    if (previous - receivedAt > delay) break;
    messageIds.push(message.id);
    if (message.mediaText) texts.push(message.mediaText.slice(0, 2000));
    if (message.body) texts.push(message.body.slice(0, 2000));
    const unread = messageAttachmentsSchema
      .parse(message.attachments ?? [])
      .some(isAwaitingReading);
    if (unread && now.getTime() - receivedAt < MEDIA_WAIT_LIMIT_MS) awaitingMedia = true;
    previous = receivedAt;
  }
  return { texts: texts.reverse(), messageIds, awaitingMedia };
}

type TurnSnapshot = { target: { contactId: string }; turn: Turn };

// True when the same customer has the same messages in the same chat version, so nothing arrived
// while the model was working.
export function isSameTurn(current: TurnSnapshot, before: TurnSnapshot) {
  return (
    current.target.contactId === before.target.contactId &&
    current.turn.version === before.turn.version &&
    current.turn.inbound.length === before.turn.inbound.length &&
    current.turn.inbound.every(({ id }, index) => id === before.turn.inbound[index]?.id)
  );
}
