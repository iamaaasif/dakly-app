'use client';
import { Trash2 } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';

import { consentChannels } from '@dakly/contracts/contacts';
import type { CreateSegmentInput } from '@dakly/contracts/segments';
import { cn } from '@dakly/ui/cn';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import {
  channelLabels,
  fieldLabels,
  kindLabels,
  newCondition,
  type SegmentField,
  sourceLabels,
} from '../segment-labels';
import { OptionSelect } from './option-select';

type ConditionPath = `rules.conditions.${number}.conditions.${number}`;

type ConditionFieldsProps = {
  path: ConditionPath;
  label: string;
  // "AND" or "OR" before every row but the first.
  joiner?: string;
  // Absent when this is the last condition of the last group: a segment needs one.
  onRemove?: () => void;
};

const fields = Object.entries(fieldLabels) as [SegmentField, string][];
const operators = [
  ['is_any_of', 'is'],
  ['is_none_of', 'is not'],
] as const;
const valueOptions = {
  source: Object.entries(sourceLabels),
  kind: Object.entries(kindLabels),
};
const channels = consentChannels.map((channel) => [channel, channelLabels[channel]] as const);
const consentOptions = [
  [true, 'Agreed'],
  [false, 'Not agreed'],
] as const;

export function ConditionFields({ path, label, joiner, onRemove }: ConditionFieldsProps) {
  const { control, setValue } = useFormContext<CreateSegmentInput>();
  const field = useWatch({ control, name: `${path}.field` });
  const handleFieldChange = (next: string) => {
    const chosen = fields.find(([value]) => value === next);
    if (chosen) setValue(path, newCondition(chosen[0]), { shouldDirty: true });
  };
  return (
    <div
      role="group"
      aria-label={label}
      className="grid items-start gap-2 rounded-lg border border-border bg-surface p-2 sm:grid-cols-[3rem_1fr_1fr_1fr_2.5rem]"
    >
      <span
        aria-hidden="true"
        className={cn(
          'px-1 pt-2.5 text-xs font-semibold text-text-muted sm:block sm:text-center',
          !joiner && 'hidden',
        )}
      >
        {joiner}
      </span>
      <FormField name={`${path}.field`} label="Field" hideLabel>
        {(controlProps) => (
          <Select value={field} onValueChange={handleFieldChange}>
            <SelectTrigger {...controlProps}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fields.map(([value, text]) => (
                <SelectItem key={value} value={value}>
                  {text}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <ConditionValueFields path={path} field={field} />
      <button
        type="button"
        disabled={!onRemove}
        onClick={onRemove}
        aria-label={`Remove ${label.toLowerCase()}`}
        className="inline-grid size-10 place-items-center justify-self-end rounded-md text-text-muted hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-40"
      >
        <Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function ConditionValueFields({ path, field }: { path: ConditionPath; field: SegmentField }) {
  const { register } = useFormContext<CreateSegmentInput>();
  if (field === 'consent')
    return (
      <>
        <OptionSelect name={`${path}.channel`} label="Channel" options={channels} />
        <OptionSelect name={`${path}.granted`} label="Consent" options={consentOptions} />
      </>
    );
  return (
    <>
      <OptionSelect name={`${path}.operator`} label="Operator" options={operators} />
      {field === 'source' || field === 'kind' ? (
        <OptionSelect name={`${path}.values.0`} label="Value" options={valueOptions[field]} />
      ) : (
        <FormField name={`${path}.values.0`} label="Value" hideLabel>
          {(controlProps) => (
            <Input
              {...controlProps}
              {...register(`${path}.values.0`)}
              placeholder={field === 'tag' ? 'e.g. vip' : 'e.g. Dhaka'}
            />
          )}
        </FormField>
      )}
    </>
  );
}
