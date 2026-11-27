'use client';
import { Plus } from 'lucide-react';
import { Fragment } from 'react';
import { useController, useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import { MAX_SEGMENT_CONDITIONS, type CreateSegmentInput } from '@dakly/contracts/segments';

import { canAddCondition, newGroup } from '../segment-labels';
import { GroupFields } from './group-fields';

export function SegmentConditions() {
  const { control, formState } = useFormContext<CreateSegmentInput>();
  const { fields, append, remove } = useFieldArray({ control, name: 'rules.conditions' });
  const rules = useWatch({ control, name: 'rules' });
  const treeError = formState.errors.rules?.message ?? formState.errors.rules?.conditions?.message;
  return (
    <div className="space-y-4">
      {fields.map((field, index) => (
        <Fragment key={field.id}>
          {index ? <GroupJoiner /> : null}
          <GroupFields
            index={index}
            onRemove={fields.length > 1 ? () => remove(index) : undefined}
          />
        </Fragment>
      ))}
      <div className="space-y-1">
        <button
          type="button"
          disabled={!canAddCondition(rules)}
          onClick={() => append(newGroup())}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-sm text-sm font-medium text-action hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50"
        >
          <Plus aria-hidden="true" size={14} strokeWidth={2} />
          Add condition group
        </button>
        {!canAddCondition(rules) ? (
          <p className="text-sm text-text-muted">
            A segment can have at most {MAX_SEGMENT_CONDITIONS} conditions.
          </p>
        ) : null}
      </div>
      {treeError ? (
        <p role="alert" className="text-danger">
          {treeError}
        </p>
      ) : null}
    </div>
  );
}

// The pill between two groups joins them; pressing it switches AND to OR for all the groups.
function GroupJoiner() {
  const { field } = useController<CreateSegmentInput, 'rules.match'>({ name: 'rules.match' });
  const word = field.value === 'any' ? 'OR' : 'AND';
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <button
        type="button"
        onClick={() => field.onChange(field.value === 'any' ? 'all' : 'any')}
        aria-label={`Groups are joined by ${word}. Press to switch to ${word === 'AND' ? 'OR' : 'AND'}.`}
        className="min-h-6 rounded-full bg-inverse px-3 text-xs font-semibold text-on-primary hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {word}
      </button>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}
