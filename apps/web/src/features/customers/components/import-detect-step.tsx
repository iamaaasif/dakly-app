import { formatCount } from '@dakly/contracts/money';

import { ImportStepActions } from '@/components/import-step-actions';
import type { UploadedImport } from '@/components/import-upload-step';

type ImportDetectStepProps = { upload: UploadedImport; onBack: () => void; onNext: () => void };

export function ImportDetectStep({ upload, onBack, onNext }: ImportDetectStepProps) {
  const { file, preview } = upload;
  const facts = [
    ['File', file.name],
    ['Rows', formatCount(preview.rowCount)],
    ['Columns', formatCount(preview.header.length)],
    ['Size', `${Math.ceil(file.size / 1024)} KB`],
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        This is what we found in your file. The first row is read as column names.
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-input-border px-4 py-3">
            <dt className="text-sm text-text-muted">{label}</dt>
            <dd className="font-semibold wrap-anywhere">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-text-muted">Columns: {preview.header.join(', ')}</p>
      <ImportStepActions onBack={onBack} next="Continue" onNext={onNext} />
    </div>
  );
}
