'use client';
import { Trash2 } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';

import { consentChannels } from '@dakly/contracts/contacts';
import type { CreateSegmentInput } from '@dakly/contracts/segments';
import { Button } from '@dakly/ui/button';
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

type ConditionPath =
  `rules.conditions.${number}` | `rules.conditions.${number}.conditions.${number}`;

type ConditionFieldsProps = {
  path: ConditionPath;
  label: string;
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

export function ConditionFields({ path, label, onRemove }: ConditionFieldsProps) {
  const { control, register, setValue } = useFormContext<CreateSegmentInput>();
  const field = useWatch({ control, name: `${path}.field` });
  const handleFieldChange = (next: string) => {
    const chosen = fields.find(([value]) => value === next);
    if (chosen) setValue(path, newCondition(chosen[0]), { shouldDirty: true });
  };
  return (
    <div
      role="group"
      aria-label={label}
      className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-4 md:items-end"
    >
      <FormField name={`${path}.field`} label="Field">
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
      {field === 'consent' ? (
        <>
          <OptionSelect name={`${path}.channel`} label="Channel" options={channels} />
          <OptionSelect name={`${path}.granted`} label="Consent" options={consentOptions} />
        </>
      ) : (
        <>
          <OptionSelect name={`${path}.operator`} label="Operator" options={operators} />
          {field === 'source' || field === 'kind' ? (
            <OptionSelect name={`${path}.values.0`} label="Value" options={valueOptions[field]} />
          ) : (
            <FormField name={`${path}.values.0`} label="Value">
              {(controlProps) => <Input {...controlProps} {...register(`${path}.values.0`)} />}
            </FormField>
          )}
        </>
      )}
      {onRemove ? (
        <Button variant="secondary" aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove}>
          <Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />
        </Button>
      ) : null}
    </div>
  );
}
