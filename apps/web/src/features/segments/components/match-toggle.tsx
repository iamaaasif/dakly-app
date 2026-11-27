'use client';
import { type FieldPath, useController } from 'react-hook-form';

import type { CreateSegmentInput } from '@dakly/contracts/segments';
import { cn } from '@dakly/ui/cn';

const choices = [
  ['all', 'ALL'],
  ['any', 'ANY'],
] as const;

type MatchToggleProps = { name: FieldPath<CreateSegmentInput>; label: string };

// A two-way switch: ALL of the conditions or ANY of them.
export function MatchToggle({ name, label }: MatchToggleProps) {
  const { field } = useController<CreateSegmentInput>({ name });
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-md border border-input-border"
    >
      {choices.map(([value, text]) => (
        <button
          key={value}
          type="button"
          aria-pressed={field.value === value}
          onClick={() => field.onChange(value)}
          className={cn(
            'min-h-8 px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
            field.value === value
              ? 'bg-action text-on-primary'
              : 'bg-surface text-text-secondary hover:bg-surface-muted',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
