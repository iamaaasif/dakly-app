import { isAwaitingReading, messageAttachmentsSchema } from '@dakly/contracts/chats';

import type { InboxService } from '../messaging/inbox.service';
import { MINUTE_MS } from '../platform/time';
import { MESSAGE_LENGTH, shorten } from './message-shortening';

type Turn = NonNullable<Awaited<ReturnType<InboxService['aiReplyTurn']>>>;

const MEDIA_WAIT_LIMIT_MS = 3 * MINUTE_MS;
// A burst never adds more than this to a model call; the newest messages win.
const BURST_LENGTH = 3000;
// The manipulation screen is a cheap word match, so it reads far more than a model may.
const SCREEN_LENGTH = 20_000;
// This many customer messages inside the window is a flood, not a chat; no model reads it.
const FLOOD_MESSAGES = 20;
const FLOOD_WINDOW_MS = 10 * MINUTE_MS;

export function isFlood(turn: Turn): boolean {
  const oldest = turn.inbound[FLOOD_MESSAGES - 1];
  return (
    oldest !== undefined &&
    turn.latest.createdAt.getTime() - oldest.createdAt.getTime() < FLOOD_WINDOW_MS
  );
}

const wordsOf = ({ mediaText, body }: { mediaText: string | null; body: string | null }) =>
  [mediaText, body].filter((text): text is string => Boolean(text));

// The latest sender's messages that arrived close together, answered as one turn.
export function burstText(turn: Turn, delay: number, now: Date) {
  const texts: string[] = [];
  const screenTexts: string[] = [];
  const messageIds: string[] = [];
  let awaitingMedia = false;
  let length = 0;
  let previous = turn.latest.createdAt.getTime();
  for (const message of turn.inbound) {
    if (message.senderIdentityId !== turn.latest.senderIdentityId) break;
    const receivedAt = message.createdAt.getTime();
    if (previous - receivedAt > delay) break;
    messageIds.push(message.id);
    for (const text of wordsOf(message)) {
      if (length < BURST_LENGTH) {
        texts.push(shorten(text));
        screenTexts.push(text.slice(0, SCREEN_LENGTH));
      }
      length += Math.min(text.length, MESSAGE_LENGTH);
    }
    const unread = messageAttachmentsSchema
      .parse(message.attachments ?? [])
      .some(isAwaitingReading);
    if (unread && now.getTime() - receivedAt < MEDIA_WAIT_LIMIT_MS) awaitingMedia = true;
    previous = receivedAt;
  }
  return { texts: texts.reverse(), screenTexts, messageIds, awaitingMedia };
}
