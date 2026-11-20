import type { UseFormReturn } from 'react-hook-form';

import { cn } from '@dakly/ui/cn';
import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';
import { Textarea } from '@dakly/ui/textarea';

import type { BrandValues } from './brand-form';

export type BrandFieldProps = {
  form: UseFormReturn<BrandValues>;
  name: Exclude<keyof BrandValues, 'voice'>;
  label: string;
  hint?: string;
  oneLine?: boolean;
  disabled: boolean;
};

export function BrandField({ form, name, label, hint, oneLine, disabled }: BrandFieldProps) {
  const error = form.formState.errors[name]?.message;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`brand-${name}`}>{label}</Label>
      {oneLine ? (
        <Input id={`brand-${name}`} disabled={disabled} {...form.register(name)} />
      ) : (
        <Textarea id={`brand-${name}`} rows={2} disabled={disabled} {...form.register(name)} />
      )}
      {(error ?? hint) && (
        <p className={cn('text-sm', error ? 'text-danger' : 'text-text-muted')}>{error ?? hint}</p>
      )}
    </div>
  );
}
