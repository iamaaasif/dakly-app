import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { notificationsKeys } from '../api/notifications-keys';
import { useSessionContext } from '@/lib/session-context';

const STREAM_FALLBACK_POLL_MS = 60_000;

// One stream per page, opened again when the session's shop or access changes. While it is
// down the notification queries are polled instead.
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
    let source: EventSource;
    let poll: ReturnType<typeof setInterval> | undefined;
    const open = () => {
      source = new EventSource('/api/events/stream');
      source.addEventListener('notification', refresh);
      source.addEventListener('open', () => {
        if (!poll) return;
        clearInterval(poll);
        poll = undefined;
        // Last-Event-ID only replays after a received message, so read what the gap missed.
        refresh();
      });
      source.addEventListener('error', () => {
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
