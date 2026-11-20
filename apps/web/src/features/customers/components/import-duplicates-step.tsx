import { useFormContext } from 'react-hook-form';

import type { ImportDuplicateMode, StartImportInput } from '@dakly/contracts/contacts';

import { ImportStepActions } from '@/components/import-step-actions';

const modes: { value: ImportDuplicateMode; label: string; hint: string }[] = [
  {
    value: 'update',
    label: 'Update their details',
    hint: 'A customer who already has this phone keeps their phone and consent. Blank cells change nothing.',
  },
  {
    value: 'skip',
    label: 'Leave existing customers as they are',
    hint: 'Rows with a phone Dakly already has are skipped.',
  },
];

type ImportDuplicatesStepProps = { onBack: () => void; onNext: () => void };

export function ImportDuplicatesStep({ onBack, onNext }: ImportDuplicatesStepProps) {
  const { register } = useFormContext<StartImportInput>();
  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 text-sm text-text-muted">
        What should Dakly do when a phone number is already a customer?
      </legend>
      {modes.map(({ value, label, hint }) => (
        <label
          key={value}
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-4"
        >
          <input type="radio" value={value} {...register('duplicateMode')} className="mt-1" />
          <span>
            <span className="block font-semibold">{label}</span>
            <span className="block text-sm text-text-muted">{hint}</span>
          </span>
        </label>
      ))}
      <ImportStepActions onBack={onBack} next="Continue" onNext={onNext} />
    </fieldset>
  );
}
