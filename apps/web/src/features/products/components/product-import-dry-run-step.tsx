import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';

import { formatCount } from '@dakly/contracts/money';
import {
  type ProductImportDryRun,
  type StartProductImportForm,
  type StartProductImportInput,
  startProductImportSchema,
} from '@dakly/contracts/product-imports';
import { ApiError } from '@dakly/ui/api-client';

import { useDryRunProductImport } from '../api/dry-run-product-import';
import { useStartProductImport } from '../api/start-product-import';
import { useCorrectedUpload } from '../api/use-corrected-upload';
import { ProductImportDryRunCounts } from './product-import-dry-run-counts';
import { dryRunColumns, ProductImportDryRunTable } from './product-import-dry-run-table';
import { ImportStepActions } from '@/components/import-step-actions';

type ProductImportDryRunStepProps = {
  importId: string;
  csv: File;
  // A corrected file is a new upload, so the dialog keeps the new import and its file.
  onReplaced: (upload: { importId: string; csv: File }) => void;
  onBack: () => void;
  onStarted: () => void;
};

// Nothing is written until Confirm. Corrections are made to the file and uploaded again, so what
// is checked is exactly what is imported.
export function ProductImportDryRunStep({
  importId,
  csv,
  onReplaced,
  onBack,
  onStarted,
}: ProductImportDryRunStepProps) {
  const { getValues, watch } = useFormContext<StartProductImportForm>();
  const mode = watch('duplicateMode');
  const parsed = startProductImportSchema.safeParse({ ...getValues(), duplicateMode: mode });
  const input = parsed.success ? parsed.data : undefined;
  const dryRun = useDryRunProductImport(importId);
  const start = useStartProductImport(importId);
  const corrected = useCorrectedUpload(csv, input);

  // The file is checked again whenever the file or the duplicate choice changes.
  useEffect(() => {
    if (input) dryRun.mutate(input);
    // `input` and `dryRun` are new objects on every render; these two decide a new check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importId, mode]);

  const result = dryRun.data;
  const failure = corrected.error ?? start.error ?? dryRun.error;
  return (
    <div className="space-y-4">
      <DuplicateChoice />
      {dryRun.isPending ? (
        <p role="status" aria-busy="true">
          Checking the file. Nothing is saved yet.
        </p>
      ) : null}
      {failure ? (
        <p role="alert" className="text-danger">
          {failure instanceof ApiError ? failure.message : 'That did not work. Try again.'}
        </p>
      ) : null}
      {result && input ? (
        <DryRunReview
          result={result}
          input={input}
          corrected={corrected}
          onBack={onBack}
          onConfirm={() => start.mutate(input, { onSuccess: onStarted })}
          onReplaced={onReplaced}
          starting={start.isPending}
        />
      ) : null}
    </div>
  );
}

function DuplicateChoice() {
  const { register } = useFormContext<StartProductImportForm>();
  return (
    <fieldset className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <legend className="sr-only">When a SKU is already in your shop</legend>
      <label className="flex items-center gap-2">
        <input type="radio" value="update" {...register('duplicateMode')} />
        Update it
      </label>
      <label className="flex items-center gap-2">
        <input type="radio" value="skip" {...register('duplicateMode')} />
        Leave it as it is
      </label>
    </fieldset>
  );
}

type DryRunReviewProps = {
  result: ProductImportDryRun;
  input: StartProductImportInput;
  corrected: ReturnType<typeof useCorrectedUpload>;
  onBack: () => void;
  onConfirm: () => void;
  onReplaced: ProductImportDryRunStepProps['onReplaced'];
  starting: boolean;
};

function DryRunReview({
  result,
  input,
  corrected,
  onBack,
  onConfirm,
  onReplaced,
  starting,
}: DryRunReviewProps) {
  const importable = result.counts.added + result.counts.changed;
  const editing = corrected.edits.size > 0;
  return (
    <>
      <ProductImportDryRunCounts result={result} />
      <p className="text-sm text-text-muted">
        <span className="font-semibold text-text">Preview</span> edit a cell to fix it before
        anything is saved. Showing {formatCount(result.rowsShown)} of{' '}
        {formatCount(Object.values<number>(result.counts).reduce((sum, count) => sum + count, 0))}{' '}
        rows, rejected rows first.
      </p>
      <ProductImportDryRunTable
        rows={result.rows}
        columns={dryRunColumns(input.mapping)}
        edits={corrected.edits}
        onEdit={corrected.edit}
      />
      <p className="text-sm text-text-muted">
        Blank cells keep the stored value. Nothing is written until Confirm.
      </p>
      <ImportStepActions
        onBack={onBack}
        next={editing ? 'Check the changes' : `Confirm and import ${formatCount(importable)} rows`}
        loading={corrected.uploading || starting}
        disabled={!editing && importable === 0}
        onNext={() => (editing ? void corrected.apply(onReplaced) : onConfirm())}
      />
    </>
  );
}
