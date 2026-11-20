import { useFormContext } from 'react-hook-form';

import type { ImportDuplicateMode } from '@dakly/contracts/contacts';
import type { StartProductImportForm } from '@dakly/contracts/product-imports';
import { ApiError } from '@dakly/ui/api-client';

import { ImportStepActions } from '@/components/import-step-actions';

const modes: { value: ImportDuplicateMode; label: string; hint: string }[] = [
  {
    value: 'update',
    label: 'Update the product',
    hint: 'A row whose SKU is already in your shop updates that size: its price, cost and stock count. Blank cells change nothing.',
  },
  {
    value: 'skip',
    label: 'Leave existing products as they are',
    hint: 'Rows whose SKU is already in your shop are skipped.',
  },
];

type ProductImportDuplicatesStepProps = {
  error: Error | null;
  loading: boolean;
  onBack: () => void;
};

export function ProductImportDuplicatesStep({
  error,
  loading,
  onBack,
}: ProductImportDuplicatesStepProps) {
  const { register } = useFormContext<StartProductImportForm>();
  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 text-sm text-text-muted">
        What should Dakly do when a SKU is already in your shop?
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
      <p className="text-sm text-text-muted">
        A stock count in the file replaces the count in your shop, and the change is recorded in the
        stock history. A product imported without a count is not tracked for stock. This import
        cannot be undone.
      </p>
      {error ? (
        <p role="alert" className="text-danger">
          {error instanceof ApiError ? error.message : 'The import did not start. Try again.'}
        </p>
      ) : null}
      <ImportStepActions onBack={onBack} next="Start import" loading={loading} />
    </fieldset>
  );
}
