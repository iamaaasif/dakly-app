import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';

export type WhenChoice = 'queue' | 'time' | 'now';

const choices: { value: WhenChoice; label: string; hint: string }[] = [
  { value: 'queue', label: 'Add to queue', hint: 'Next open posting slot (recommended)' },
  { value: 'time', label: 'Pick date and time', hint: 'Choose when it goes out' },
  { value: 'now', label: 'Publish now', hint: 'Goes out within a minute' },
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
      <legend className="sr-only">When</legend>
      <h2 aria-hidden="true" className="text-sm font-semibold">
        When
      </h2>
      {choices.map(({ value, label, hint }) => (
        <label key={value} className="flex cursor-pointer items-start gap-3">
          <input
            type="radio"
            name="when"
            className="mt-1 size-4 accent-action"
            checked={choice === value}
            onChange={() => onChoice(value)}
          />
          <span>
            <span className="block text-sm font-semibold">{label}</span>
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
    </fieldset>
  );
}
