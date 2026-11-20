import { Plus, X } from 'lucide-react';
import { useState } from 'react';

import type { PostingSlot } from '@dakly/contracts/social';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

import { formatSlotTime } from '../social-labels';

type WeekdaySlotsProps = {
  label: string;
  times: PostingSlot['time'][];
  canEdit: boolean;
  onAdd: (time: PostingSlot['time']) => void;
  onRemove: (time: PostingSlot['time']) => void;
};

export function WeekdaySlots({ label, times, canEdit, onAdd, onRemove }: WeekdaySlotsProps) {
  const [adding, setAdding] = useState(false);
  const finishAdding = (time: string) => {
    setAdding(false);
    if (time) onAdd(time);
  };
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="w-10 font-semibold">{label}</span>
      <ul className="flex min-w-0 flex-1 flex-wrap gap-2">
        {[...times].sort().map((time) => (
          <li
            key={time}
            className="flex items-center gap-1 rounded-full bg-surface-muted py-1 pr-1 pl-3 text-sm"
          >
            {formatSlotTime(time)}
            {canEdit && (
              <button
                type="button"
                aria-label={`Remove ${formatSlotTime(time)} on ${label}`}
                className="grid size-6 place-items-center rounded-full hover:bg-border focus-visible:outline-2 focus-visible:outline-focus"
                onClick={() => onRemove(time)}
              >
                <X aria-hidden="true" size={12} strokeWidth={1.75} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && adding && (
        <Input
          type="time"
          aria-label={`New time on ${label}`}
          autoFocus
          className="w-32"
          onBlur={(event) => finishAdding(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') finishAdding(event.currentTarget.value);
          }}
        />
      )}
      {canEdit && !adding && (
        <Button
          variant="link"
          aria-label={`Add a time on ${label}`}
          onClick={() => setAdding(true)}
        >
          <Plus aria-hidden="true" size={16} strokeWidth={1.75} /> Add time
        </Button>
      )}
    </li>
  );
}
