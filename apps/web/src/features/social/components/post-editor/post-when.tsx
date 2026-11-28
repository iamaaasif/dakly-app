import { Clock } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@dakly/ui/badge';
import { cn } from '@dakly/ui/cn';
import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';

export type WhenChoice = 'queue' | 'time' | 'now';

const choices: { value: WhenChoice; label: string; hint: string; badge?: string }[] = [
  {
    value: 'queue',
    label: 'Auto-schedule',
    badge: 'Recommended',
    hint: 'Dakly posts at the next open time in your posting schedule',
  },
  { value: 'time', label: 'Pick a date and time', hint: 'Choose exactly when it goes out' },
  { value: 'now', label: 'Publish now', hint: 'Post right away' },
];

type PostWhenFieldProps = {
  choice: WhenChoice;
  time: string;
  timeError: boolean;
  onChoice: (choice: WhenChoice) => void;
  onTime: (time: string) => void;
};

export function PostWhenField({ choice, time, timeError, onChoice, onTime }: PostWhenFieldProps) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <legend className="sr-only">When to post</legend>
      <h2 aria-hidden="true" className="text-sm font-semibold">
        When to post
      </h2>
      {choices.map(({ value, label, hint, badge }) => (
        <label
          key={value}
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-md border p-3',
            choice === value ? 'border-primary bg-primary-soft' : 'border-border-strong',
          )}
        >
          <input
            type="radio"
            name="when"
            className="mt-1 size-4 accent-action"
            checked={choice === value}
            onChange={() => onChoice(value)}
          />
          <span>
            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {label}
              {badge && <Badge variant="info">{badge}</Badge>}
            </span>
            <span className="block text-xs text-text-muted">{hint}</span>
          </span>
        </label>
      ))}
      {choice === 'time' && (
        <div className="space-y-1.5">
          <Label htmlFor="post-time">Scheduled time</Label>
          <Input
            id="post-time"
            type="datetime-local"
            value={time}
            aria-invalid={timeError}
            onChange={(event) => onTime(event.target.value)}
          />
          {timeError && (
            <p role="alert" className="text-sm text-danger">
              Pick a date and time.
            </p>
          )}
        </div>
      )}
      <Link
        href="/social"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-action hover:underline"
      >
        <Clock aria-hidden="true" size={16} strokeWidth={1.75} /> Edit posting schedule
      </Link>
    </fieldset>
  );
}
