import { Upload } from 'lucide-react';
import { useState, type DragEvent } from 'react';

import { ApiError } from '@dakly/ui/api-client';
import { cn } from '@dakly/ui/cn';

import { ImportStepActions } from './import-step-actions';
import { checkImportFile, readImportFile, type ImportFileSummary } from '@/lib/import-file';
import { useUploadImport } from '@/lib/use-upload-import';

type ImportUploadStepProps = {
  path: Parameters<typeof useUploadImport>[0];
  // What a row is, in the plural, the name of the file picker and the CSV a shop can download.
  rowName: string;
  fileLabel: string;
  template: { filename: string; csv: string };
  onUploaded: (upload: { importId: string; preview: ImportFileSummary }) => void;
};

export function ImportUploadStep({
  path,
  rowName,
  fileLabel,
  template,
  onUploaded,
}: ImportUploadStepProps) {
  const [chosen, setChosen] = useState<{ file: File; preview: ImportFileSummary }>();
  const [problem, setProblem] = useState<string>();
  const upload = useUploadImport(path);

  async function choose(file: File | undefined) {
    if (!file) return;
    setChosen(undefined);
    const fileProblem = checkImportFile(file);
    const read = fileProblem ? undefined : readImportFile(await file.arrayBuffer(), rowName);
    const message = fileProblem ?? (typeof read === 'string' ? read : undefined);
    setProblem(message);
    if (!message && typeof read === 'object') setChosen({ file, preview: read });
  }

  return (
    <div className="space-y-4">
      <ImportDropzone label={fileLabel} onFile={(file) => void choose(file)} />
      {chosen ? (
        <p role="status" className="text-sm">
          <span className="font-semibold wrap-anywhere">{chosen.file.name}</span>
          {` · ${chosen.preview.rowCount} rows · ${chosen.preview.header.length} columns · ${Math.ceil(chosen.file.size / 1024)} KB`}
        </p>
      ) : null}
      {problem ? (
        <p role="alert" className="text-danger">
          {problem}
        </p>
      ) : null}
      {upload.error ? (
        <p role="alert" className="text-danger">
          {upload.error instanceof ApiError ? upload.error.message : 'The file did not upload.'}
        </p>
      ) : null}
      <ImportFileNote rowName={rowName} template={template} />
      <ImportStepActions
        next="Continue"
        disabled={!chosen}
        loading={upload.isPending}
        onNext={() =>
          chosen &&
          upload.mutate(chosen.file, {
            onSuccess: (importId) => onUploaded({ importId, preview: chosen.preview }),
          })
        }
      />
    </div>
  );
}

function ImportDropzone({
  label,
  onFile,
}: {
  label: string;
  onFile: (file: File | undefined) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    onFile(event.dataTransfer.files[0]);
  };
  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-input-border px-4 py-8 text-center focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
        dragging ? 'bg-primary-soft' : 'bg-surface',
      )}
    >
      <Upload aria-hidden="true" size={20} strokeWidth={1.75} className="text-action" />
      <span className="font-semibold">Choose a file or drag it here</span>
      <span className="text-sm text-text-muted">The first row should have column names</span>
      <input
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        aria-label={label}
        onChange={(event) => onFile(event.target.files?.[0])}
      />
    </label>
  );
}

function ImportFileNote({
  rowName,
  template,
}: Pick<ImportUploadStepProps, 'rowName' | 'template'>) {
  return (
    <p className="text-sm text-text-muted">
      CSV, up to 10 MB and 50,000 {rowName}.{' '}
      <a
        href={`data:text/csv;charset=utf-8,${encodeURIComponent(template.csv)}`}
        download={template.filename}
        className="text-action underline"
      >
        Download a template
      </a>
    </p>
  );
}
