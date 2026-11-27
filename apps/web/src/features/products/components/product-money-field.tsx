import { useState } from 'react';
import { useController, useFormContext, type FieldPath } from 'react-hook-form';

import { takaInput, type ProductFormValues } from '@dakly/contracts/products';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { formatTakaNumber } from '@/lib/format-money';

type ProductMoneyFieldProps = {
  name: FieldPath<ProductFormValues>;
  label: string;
  optional?: boolean;
  hint?: string;
  deps?: FieldPath<ProductFormValues>;
};

// "1,850" and "1850" are the same amount. The field keeps the plain digits and shows Taka grouping
// once you leave it.
export function ProductMoneyField({ name, label, optional, hint, deps }: ProductMoneyFieldProps) {
  const { control, trigger } = useFormContext<ProductFormValues>();
  const { field } = useController({ control, name });
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState('');
  const stored = typeof field.value === 'string' ? field.value : '';
  const parsed = takaInput.safeParse(stored);
  const grouped = parsed.success ? formatTakaNumber(parsed.data) : stored;
  const shown = focused ? typed : grouped;
  return (
    <FormField name={name} label={label} optional={optional} hint={hint}>
      {(controlProps) => (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-muted"
          >
            ৳
          </span>
          <Input
            {...controlProps}
            ref={field.ref}
            name={field.name}
            inputMode="decimal"
            className="pl-8"
            value={shown}
            onFocus={() => {
              setTyped(shown);
              setFocused(true);
            }}
            onBlur={() => {
              setFocused(false);
              field.onBlur();
            }}
            onChange={(event) => {
              setTyped(event.target.value);
              field.onChange(event.target.value.replace(/[,\s৳]/g, ''));
              if (deps) void trigger(deps);
            }}
          />
        </div>
      )}
    </FormField>
  );
}
