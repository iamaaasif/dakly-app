'use client';
import { Plus } from 'lucide-react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import type { CreateSegmentInput } from '@dakly/contracts/segments';

import { canAddCondition, newCondition } from '../segment-labels';
import { ConditionFields } from './condition-fields';
import { MatchToggle } from './match-toggle';

type GroupFieldsProps = {
  index: number;
  // Absent when this is the only group: a segment needs one.
  onRemove?: () => void;
};

const joinerWord = (match: 'all' | 'any') => (match === 'any' ? 'OR' : 'AND');

export function GroupFields({ index, onRemove }: GroupFieldsProps) {
  const { control } = useFormContext<CreateSegmentInput>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: `rules.conditions.${index}.conditions`,
  });
  const match = useWatch({ control, name: `rules.conditions.${index}.match` });
  const rules = useWatch({ control, name: 'rules' });
  const label = `Group ${index + 1}`;
  return (
    <fieldset className="rounded-xl min-w-0 space-y-2 border border-border bg-surface-muted p-3 sm:p-4">
      <legend className="sr-only">{label}</legend>
      <div className="flex flex-wrap items-center gap-2 pb-1 text-base">
        <span className="text-xs font-bold">IF</span>
        <span>contacts match</span>
        <MatchToggle name={`rules.conditions.${index}.match`} label={`${label} matches`} />
        <span>of these</span>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${label.toLowerCase()}`}
            className="ml-auto min-h-8 rounded-sm px-1 text-sm font-medium text-danger hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Remove group
          </button>
        ) : null}
      </div>
      {fields.map((field, position) => (
        <ConditionFields
          key={field.id}
          path={`rules.conditions.${index}.conditions.${position}`}
          label={`${label}, condition ${position + 1}`}
          joiner={position ? joinerWord(match) : undefined}
          // A group needs at least one condition, so removing the last one removes the group.
          onRemove={fields.length > 1 ? () => remove(position) : onRemove}
        />
      ))}
      <button
        type="button"
        disabled={!canAddCondition(rules)}
        onClick={() => append(newCondition('tag'))}
        aria-label={`Add condition to ${label.toLowerCase()}`}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-dashed border-action px-3 text-sm font-medium text-action hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50"
      >
        <Plus aria-hidden="true" size={14} strokeWidth={2} />
        Add condition
      </button>
    </fieldset>
  );
}
