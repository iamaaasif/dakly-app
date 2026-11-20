import { Upload } from 'lucide-react';
import { useState, type DragEvent } from 'react';

import { ApiError } from '@dakly/ui/api-client';
import { cn } from '@dakly/ui/cn';

import { ImportStepActions } from './import-step-actions';
import { prepareImportFile, type ImportFileSummary } from '@/lib/import-file';
import { useUploadImport } from '@/lib/use-upload-import';

export type UploadedImport = {
  importId: string;
  preview: ImportFileSummary;
  file: { name: string; size: number };
};

type ImportUploadStepProps = {
  path: Parameters<typeof useUploadImport>[0];
  // What a row is, in the plural, the name of the file picker and the CSV a shop can download.
  rowName: string;
  fileLabel: string;
  template: { filename: string; csv: string };
  // Customer files may be Excel; the browser turns the first sheet into CSV before it uploads.
  excel?: boolean;
  onUploaded: (upload: UploadedImport) => void;
};

export function ImportUploadStep({
  path,
  rowName,
  fileLabel,
  template,
  excel = false,
  onUploaded,
}: ImportUploadStepProps) {
  const [chosen, setChosen] = useState<{ file: File; source: File; preview: ImportFileSummary }>();
  const [problem, setProblem] = useState<string>();
  const upload = useUploadImport(path);

  async function choose(file: File | undefined) {
    if (!file) return;
    setChosen(undefined);
    const prepared = await prepareImportFile(file, rowName, excel);
    setProblem(typeof prepared === 'string' ? prepared : undefined);
    // `source` is the file the owner picked; `file` may be the CSV made from it.
    if (typeof prepared === 'object') setChosen({ ...prepared, source: file });
  }

  return (
    <div className="space-y-4">
      <ImportDropzone label={fileLabel} excel={excel} onFile={(file) => void choose(file)} />
      {chosen ? (
        <p role="status" className="text-sm">
          <span className="font-semibold wrap-anywhere">{chosen.source.name}</span>
          {` · ${chosen.preview.rowCount} rows · ${chosen.preview.header.length} columns · ${Math.ceil(chosen.source.size / 1024)} KB`}
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
      <ImportFileNote rowName={rowName} template={template} excel={excel} />
      <ImportStepActions
        next="Continue"
        disabled={!chosen}
        loading={upload.isPending}
        onNext={() =>
          chosen &&
          upload.mutate(chosen.file, {
            onSuccess: (importId) =>
              onUploaded({
                importId,
                preview: chosen.preview,
                file: { name: chosen.source.name, size: chosen.source.size },
              }),
          })
        }
      />
    </div>
  );
}

function ImportDropzone({
  label,
  excel,
  onFile,
}: {
  label: string;
  excel: boolean;
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
        accept={excel ? '.csv,text/csv,.xlsx' : '.csv,text/csv'}
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
  excel,
}: Pick<ImportUploadStepProps, 'rowName' | 'template'> & { excel: boolean }) {
  return (
    <p className="text-sm text-text-muted">
      {excel ? 'Excel (.xlsx) or CSV' : 'CSV'}, up to 10 MB and 50,000 {rowName}.{' '}
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
