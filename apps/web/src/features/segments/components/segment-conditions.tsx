'use client';
import { Plus } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';

import type { CreateSegmentInput } from '@dakly/contracts/segments';
import { Button } from '@dakly/ui/button';

import { matchOptions, newCondition } from '../segment-labels';
import { ConditionFields } from './condition-fields';
import { GroupFields } from './group-fields';
import { OptionSelect } from './option-select';

export function SegmentConditions() {
  const { control, formState } = useFormContext<CreateSegmentInput>();
  const { fields, append, remove } = useFieldArray({ control, name: 'rules.conditions' });
  const treeError = formState.errors.rules?.message ?? formState.errors.rules?.conditions?.message;
  return (
    <>
      <OptionSelect name="rules.match" label="Customers match" options={matchOptions} />
      {fields.map((field, index) =>
        'match' in field ? (
          <GroupFields key={field.id} index={index} onRemove={() => remove(index)} />
        ) : (
          <ConditionFields
            key={field.id}
            path={`rules.conditions.${index}`}
            label={`Condition ${index + 1}`}
            onRemove={fields.length > 1 ? () => remove(index) : undefined}
          />
        ),
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => append(newCondition('tag'))}>
          <Plus aria-hidden="true" size={16} strokeWidth={1.75} />
          Add condition
        </Button>
        <Button
          variant="secondary"
          onClick={() => append({ match: 'any', conditions: [newCondition('tag')] })}
        >
          <Plus aria-hidden="true" size={16} strokeWidth={1.75} />
          Add condition group
        </Button>
      </div>
      {treeError ? (
        <p role="alert" className="text-danger">
          {treeError}
        </p>
      ) : null}
    </>
  );
}
