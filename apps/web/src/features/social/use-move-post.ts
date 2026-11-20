import { useState } from 'react';

import { useReschedulePost } from './api/reschedule-post';
import { postTitle } from './components/post-chip';
import { timeOnDay, type CalendarEntry } from './post-calendar';
import { formatShortDate } from '@/lib/format-date';

type Notice = { message: string; tone?: 'error' };

// Moves a scheduled post to another day and says what happened.
export function useMovePost() {
  const reschedule = useReschedulePost();
  const [notice, setNotice] = useState<Notice | null>(null);
  const move = (entry: CalendarEntry, day: string) => {
    const scheduledFor = timeOnDay(entry, day);
    reschedule.mutate(
      { postId: entry.post.id, scheduledFor },
      {
        onSuccess: () =>
          setNotice({
            message: `Moved “${postTitle(entry)}” to ${formatShortDate(scheduledFor)}.`,
          }),
        onError: (error) => setNotice({ message: error.message, tone: 'error' }),
      },
    );
  };
  return { notice, move };
}
