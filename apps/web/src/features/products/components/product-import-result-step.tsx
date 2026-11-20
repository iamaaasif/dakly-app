import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { ImportOutcome } from '@/components/import-outcome';
import { productsKeys } from '@/lib/product-query-keys';
import { isImportFinished, useImportProgress } from '@/lib/use-import-progress';

type ProductImportResultStepProps = { importId: string; onDone: () => void };

export function ProductImportResultStep({ importId, onDone }: ProductImportResultStepProps) {
  const progress = useImportProgress(importId, {
    path: '/product-imports',
    queryKey: (tag) => productsKeys.import(tag, importId),
  });
  if (progress.error && !progress.data)
    return (
      <QueryError
        message={progress.error.message}
        onRetry={() => void progress.refetch()}
        retryLabel="Retry import status"
      />
    );
  const current = progress.data;
  if (!current || !isImportFinished(current.status))
    return (
      <p role="status" aria-busy="true">
        Importing products. Keep this window open to see the result.
      </p>
    );
  return (
    <div className="space-y-4">
      <p role="status" className="font-semibold">
        {current.status === 'failed'
          ? 'The import stopped. Products saved before it stopped are kept.'
          : 'Import finished.'}
      </p>
      <ImportOutcome current={current} />
      <div className="flex justify-end pt-2">
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}
