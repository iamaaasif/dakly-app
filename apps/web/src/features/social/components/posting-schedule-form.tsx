import { useState } from 'react';

import type { PostingSlot, PostingSlotsResponse } from '@dakly/contracts/social';
import { Button } from '@dakly/ui/button';

import { useSavePostingSlots } from '../api/save-posting-slots';
import { weekdays } from '../social-labels';
import { WeekdaySlots } from './weekday-slots';
import { formatTimeZone } from '@/lib/format-date';

type PostingScheduleFormProps = {
  saved: PostingSlotsResponse;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function PostingScheduleForm({
  saved,
  canEdit,
  onClose,
  onSaved,
}: PostingScheduleFormProps) {
  const [slots, setSlots] = useState<PostingSlot[]>(saved.slots);
  const save = useSavePostingSlots();
  const addSlot = (weekday: number, time: string) => {
    if (!slots.some((slot) => slot.weekday === weekday && slot.time === time))
      setSlots([...slots, { weekday, time }]);
  };
  return (
    <div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {weekdays.map(({ weekday, label }) => (
          <WeekdaySlots
            key={weekday}
            label={label}
            times={slots.filter((slot) => slot.weekday === weekday).map(({ time }) => time)}
            canEdit={canEdit}
            onAdd={(time) => addSlot(weekday, time)}
            onRemove={(time) =>
              setSlots(slots.filter((slot) => slot.weekday !== weekday || slot.time !== time))
            }
          />
        ))}
      </ul>
      <p className="mt-3 text-sm text-text-muted">
        {slots.length} posting {slots.length === 1 ? 'time' : 'times'} a week ·{' '}
        {formatTimeZone(saved.timeZone)}
      </p>
      {save.isError && (
        <p role="alert" className="mt-3 text-danger">
          {save.error.message}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" disabled={save.isPending} onClick={onClose}>
          Cancel
        </Button>
        {canEdit && (
          <Button
            loading={save.isPending}
            onClick={() =>
              save.mutate(
                { channelConnectionId: saved.channelConnectionId, slots },
                { onSuccess: onSaved },
              )
            }
          >
            Save schedule
          </Button>
        )}
      </div>
    </div>
  );
}
