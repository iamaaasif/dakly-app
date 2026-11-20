import { useFormContext } from 'react-hook-form';

import type { StartImportInput } from '@dakly/contracts/contacts';
import { FormField } from '@dakly/ui/form-field';

import { importFields } from '../import-fields';
import { ImportStepActions } from './import-step-actions';

type ImportMappingStepProps = { header: string[]; onBack: () => void; onNext: () => void };

export function ImportMappingStep({ header, onBack, onNext }: ImportMappingStepProps) {
  const { register, getValues, setError, trigger, formState } = useFormContext<StartImportInput>();

  async function next() {
    if (getValues('mapping.phone') === undefined) {
      setError('mapping.phone', { message: 'Choose the column that has phone numbers' });
      return;
    }
    if (await trigger('mapping')) onNext();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Match each Dakly field to a column in your file. Phone is required.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {importFields.map(({ field, label }) => (
          <FormField
            key={field}
            name={`mapping.${field}`}
            label={label}
            optional={field !== 'phone'}
          >
            {(control) => (
              <select
                {...control}
                {...register(`mapping.${field}`, {
                  setValueAs: (value: string) => (value === '' ? undefined : Number(value)),
                })}
                className="min-h-10 w-full rounded-md border border-input-border bg-surface px-3"
              >
                <option value="">{field === 'phone' ? 'Choose a column' : 'Do not import'}</option>
                {header.map((name, column) => (
                  <option key={column} value={column}>
                    {name.trim() || `Column ${column + 1}`}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        ))}
      </div>
      {formState.errors.mapping?.message ? (
        <p role="alert" className="text-danger">
          {formState.errors.mapping.message}
        </p>
      ) : null}
      <ImportStepActions onBack={onBack} next="Continue" onNext={() => void next()} />
    </div>
  );
}
