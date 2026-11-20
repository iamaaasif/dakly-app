import type { ReactNode } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';

import type { StartProductImportForm } from '@dakly/contracts/product-imports';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { productImportFields } from '../product-import-fields';
import { ImportStepActions } from '@/components/import-step-actions';

const MAX_OPTIONS = 3;
const selectClass = 'min-h-10 w-full rounded-md border border-input-border bg-surface px-3';
const columnValue = (value: string) => (value === '' ? undefined : Number(value));

type ProductImportMappingStepProps = {
  header: string[];
  onBack: () => void;
  onNext: () => void;
};

export function ProductImportMappingStep({
  header,
  onBack,
  onNext,
}: ProductImportMappingStepProps) {
  const { register, getValues, setError, trigger, formState } =
    useFormContext<StartProductImportForm>();
  const columns = header.map((name, column) => (
    <option key={column} value={column}>
      {name.trim() || `Column ${column + 1}`}
    </option>
  ));

  async function next() {
    const missing = productImportFields.filter(
      ({ field, required }) => required && getValues(`mapping.${field}`) === undefined,
    );
    for (const { field, label } of missing)
      setError(`mapping.${field}`, {
        message: `Choose the column that has ${label.toLowerCase()}`,
      });
    if (missing.length === 0 && (await trigger('mapping'))) onNext();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Match each Dakly field to a column in your file. Product name and price are required. One
        row is one size or colour; rows with the same product name make one product.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {productImportFields.map(({ field, label, required }) => (
          <FormField key={field} name={`mapping.${field}`} label={label} optional={!required}>
            {(fieldControl) => (
              <select
                {...fieldControl}
                {...register(`mapping.${field}`, { setValueAs: columnValue })}
                className={selectClass}
              >
                <option value="">{required ? 'Choose a column' : 'Do not import'}</option>
                {columns}
              </select>
            )}
          </FormField>
        ))}
      </div>
      <ProductImportOptionFields columns={columns} />
      {formState.errors.mapping?.message ? (
        <p role="alert" className="text-danger">
          {formState.errors.mapping.message}
        </p>
      ) : null}
      <ImportStepActions onBack={onBack} next="Continue" onNext={() => void next()} />
    </div>
  );
}

function ProductImportOptionFields({ columns }: { columns: ReactNode[] }) {
  const { register, control } = useFormContext<StartProductImportForm>();
  const options = useFieldArray({ control, name: 'mapping.options' });
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">Size, colour and other options</legend>
      <p className="text-sm text-text-muted">
        Name each option and choose its column. Every row must fill it in.
      </p>
      {options.fields.map((option, index) => (
        <div key={option.id} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <FormField name={`mapping.options.${index}.name`} label="Option name">
            {(fieldControl) => (
              <Input {...fieldControl} {...register(`mapping.options.${index}.name`)} />
            )}
          </FormField>
          <FormField name={`mapping.options.${index}.column`} label="Column">
            {(fieldControl) => (
              <select
                {...fieldControl}
                {...register(`mapping.options.${index}.column`, { valueAsNumber: true })}
                className={selectClass}
              >
                {columns}
              </select>
            )}
          </FormField>
          <Button variant="secondary" onClick={() => options.remove(index)}>
            Remove
          </Button>
        </div>
      ))}
      {options.fields.length < MAX_OPTIONS ? (
        <Button variant="secondary" onClick={() => options.append({ name: '', column: 0 })}>
          Add an option column
        </Button>
      ) : null}
    </fieldset>
  );
}
