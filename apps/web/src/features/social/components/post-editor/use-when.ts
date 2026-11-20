import { useState } from 'react';

import type { PostWhen } from './post-editor-types';
import type { WhenChoice } from './post-when';

// The When choice; mode() is undefined while a picked time is missing or invalid.
export function useWhen() {
  const [choice, setChoice] = useState<WhenChoice>('queue');
  const [time, setTime] = useState('');
  const [timeError, setTimeError] = useState(false);
  const mode = (): PostWhen | undefined => {
    if (choice !== 'time') return { mode: choice };
    const at = new Date(time);
    setTimeError(Number.isNaN(at.getTime()));
    return Number.isNaN(at.getTime()) ? undefined : { mode: 'time', scheduledFor: at.toJSON() };
  };
  return { choice, setChoice, time, setTime, timeError, mode };
}
