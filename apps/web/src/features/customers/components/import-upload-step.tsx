import { Upload } from 'lucide-react';
import { useState, type DragEvent } from 'react';

import { ApiError } from '@dakly/ui/api-client';

import { useUploadImport } from '../api/upload-import';
import { checkImportFile, readImportFile, type ImportFileSummary } from '../import-file';
import { ImportStepActions } from './import-step-actions';

const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(
  'Name,Phone,WhatsApp number,Email,Address,District,Tags,Notes\r\nRahima Akter,01712345678,,rahima@example.com,"House 4, Road 2",Dhaka,eid,\r\n',
)}`;

type ImportUploadStepProps = {
  onUploaded: (upload: { importId: string; preview: ImportFileSummary }) => void;
};

export function ImportUploadStep({ onUploaded }: ImportUploadStepProps) {
  const [chosen, setChosen] = useState<{ file: File; preview: ImportFileSummary }>();
  const [problem, setProblem] = useState<string>();
  const upload = useUploadImport();

  async function choose(file: File | undefined) {
    if (!file) return;
    setChosen(undefined);
    const fileProblem = checkImportFile(file);
    const read = fileProblem ? undefined : readImportFile(await file.arrayBuffer());
    const message = fileProblem ?? (typeof read === 'string' ? read : undefined);
    setProblem(message);
    if (!message && typeof read === 'object') setChosen({ file, preview: read });
  }

  return (
    <div className="space-y-4">
      <ImportDropzone onFile={(file) => void choose(file)} />
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
      <p className="text-sm text-text-muted">
        CSV, up to 10 MB and 50,000 customers.{' '}
        <a
          href={templateHref}
          download="dakly-customers-template.csv"
          className="text-action underline"
        >
          Download a template
        </a>
      </p>
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

function ImportDropzone({ onFile }: { onFile: (file: File | undefined) => void }) {
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
      className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-input-border px-4 py-8 text-center focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus ${dragging ? 'bg-primary-soft' : 'bg-surface'}`}
    >
      <Upload aria-hidden="true" size={20} strokeWidth={1.75} className="text-action" />
      <span className="font-semibold">Choose a file or drag it here</span>
      <span className="text-sm text-text-muted">The first row should have column names</span>
      <input
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        aria-label="Customer file"
        onChange={(event) => onFile(event.target.files?.[0])}
      />
    </label>
  );
}
