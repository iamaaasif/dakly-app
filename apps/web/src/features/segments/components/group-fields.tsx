'use client';
import { Plus } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';

import type { CreateSegmentInput } from '@dakly/contracts/segments';
import { Button } from '@dakly/ui/button';

import { matchOptions, newCondition } from '../segment-labels';
import { ConditionFields } from './condition-fields';
import { OptionSelect } from './option-select';

type GroupFieldsProps = {
  index: number;
  onRemove: () => void;
};

export function GroupFields({ index, onRemove }: GroupFieldsProps) {
  const { control } = useFormContext<CreateSegmentInput>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: `rules.conditions.${index}.conditions`,
  });
  const label = `Group ${index + 1}`;
  return (
    <fieldset className="min-w-0 space-y-3 rounded-lg border border-border bg-surface-muted p-3">
      <legend className="px-1 font-semibold">{label}</legend>
      <OptionSelect
        name={`rules.conditions.${index}.match`}
        label="Customers in this group match"
        options={matchOptions}
      />
      {fields.map((field, position) => (
        <ConditionFields
          key={field.id}
          path={`rules.conditions.${index}.conditions.${position}`}
          label={`${label}, condition ${position + 1}`}
          // A group needs at least one condition, so removing the last one removes the group.
          onRemove={() => (fields.length > 1 ? remove(position) : onRemove())}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => append(newCondition('tag'))}>
          <Plus aria-hidden="true" size={16} strokeWidth={1.75} />
          Add condition to {label.toLowerCase()}
        </Button>
        <Button variant="secondary" onClick={onRemove}>
          Remove {label.toLowerCase()}
        </Button>
      </div>
    </fieldset>
  );
}
