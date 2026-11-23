import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { z } from 'zod';

import { notificationsKeys } from '../api/notifications-keys';
import { useSessionContext } from '@/lib/session-context';

const STREAM_FALLBACK_POLL_MS = 15_000;
const INBOX_BURST_MS = 300;
const inboxSignalSchema = z.object({ conversationId: z.uuid() });

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// The first signal for a chat reads it at once; signals during the next 300 ms read it once more.
// The keys are the Chats feature's; features cannot import each other.
function inboxReader(client: QueryClient, contextTag: string | undefined) {
  const busyChats = new Map<string, { isDirty: boolean }>();
  const readChat = (conversationId: string) => {
    const keys = [
      ['chats', contextTag, 'list'],
      ['chats', contextTag, 'counts'],
      ['chats', contextTag, 'conversation', conversationId],
      ['chats', contextTag, 'messages', conversationId],
    ];
    for (const queryKey of keys) void client.invalidateQueries({ queryKey });
  };
  return (event: Event) => {
    const parsed = inboxSignalSchema.safeParse(parseJson((event as MessageEvent<string>).data));
    if (!parsed.success) return void client.invalidateQueries({ queryKey: ['chats'] });
    const { conversationId } = parsed.data;
    const busy = busyChats.get(conversationId);
    if (busy) {
      busy.isDirty = true;
      return;
    }
    readChat(conversationId);
    const entry = { isDirty: false };
    busyChats.set(conversationId, entry);
    setTimeout(() => {
      busyChats.delete(conversationId);
      if (entry.isDirty) readChat(conversationId);
    }, INBOX_BURST_MS);
  };
}

// One stream per page, carrying notifications and a signal that the shop's chats changed, opened again when the session's shop or access changes. While it is
// down the notification queries are polled instead, every 15 seconds, and the inbox is read again when it comes back.
export function useEventStream() {
  const client = useQueryClient();
  const contextTag = useSessionContext().data?.contextTag;

  useEffect(() => {
    // A chat that needs a person arrives as a notification, so the inbox reads again too. The key is
    // the Chats feature's root; features cannot import each other.
    const refresh = () => {
      void client.invalidateQueries({ queryKey: notificationsKeys.all });
      void client.invalidateQueries({ queryKey: ['chats'] });
    };
    const refreshInbox = inboxReader(client, contextTag);
    let hasBeenDown = false;
    let source: EventSource;
    let poll: ReturnType<typeof setInterval> | undefined;
    const open = () => {
      source = new EventSource('/api/events/stream');
      source.addEventListener('notification', refresh);
      source.addEventListener('inbox', refreshInbox);
      source.addEventListener('open', () => {
        clearInterval(poll);
        poll = undefined;
        // Inbox signals are not replayed, so a stream that was down reads everything again. The
        // first open has nothing to catch up on.
        if (hasBeenDown) {
          hasBeenDown = false;
          refresh();
        }
      });
      source.addEventListener('error', () => {
        hasBeenDown = true;
        poll ??= setInterval(() => {
          refresh();
          // The browser stops retrying after an error response, such as a 502 during a deploy.
          if (source.readyState === EventSource.CLOSED) open();
        }, STREAM_FALLBACK_POLL_MS);
      });
    };
    open();
    return () => {
      clearInterval(poll);
      source.close();
    };
  }, [client, contextTag]);
}
