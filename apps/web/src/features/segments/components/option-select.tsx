'use client';
import { type FieldPath, useController } from 'react-hook-form';

import type { CreateSegmentInput } from '@dakly/contracts/segments';
import { FormField } from '@dakly/ui/form-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

type OptionSelectProps<Value extends string | boolean> = {
  name: FieldPath<CreateSegmentInput>;
  label: string;
  options: readonly (readonly [Value, string])[];
};

// Radix items take strings only, so a boolean option is matched back to its real value.
export function OptionSelect<Value extends string | boolean>({
  name,
  label,
  options,
}: OptionSelectProps<Value>) {
  const { field } = useController<CreateSegmentInput>({ name });
  return (
    <FormField name={name} label={label}>
      {(control) => (
        <Select
          value={String(field.value)}
          onValueChange={(next) =>
            field.onChange(options.find(([value]) => String(value) === next)?.[0])
          }
        >
          <SelectTrigger {...control} onBlur={field.onBlur}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(([value, text]) => (
              <SelectItem key={String(value)} value={String(value)}>
                {text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}
