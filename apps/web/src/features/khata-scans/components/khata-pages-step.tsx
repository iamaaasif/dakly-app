import { Camera, Check, Sparkles, Upload, X } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';

import { Button } from '@dakly/ui/button';

import { useScanKhataPages } from '../api/scan-khata-pages';

const MAX_PAGES_AT_ONCE = 10;
const tips = [
  'Capture the whole page',
  'Use good light, no shadows',
  'Hold the phone straight above',
  'Keep it sharp, not blurry',
];

type PagesStepProps = { onBack: () => void; onRead: (pageIds: string[]) => void };

export function KhataPagesStep({ onBack, onRead }: PagesStepProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [tooMany, setTooMany] = useState(false);
  const scan = useScanKhataPages();

  function add(event: ChangeEvent<HTMLInputElement>) {
    const next = [...files, ...Array.from(event.target.files ?? [])];
    event.target.value = '';
    setTooMany(next.length > MAX_PAGES_AT_ONCE);
    setFiles(next.slice(0, MAX_PAGES_AT_ONCE));
  }

  return (
    <div className="grid items-start gap-4 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))]">
      <section
        aria-labelledby="add-pages"
        className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="add-pages" className="font-semibold">
          Add khata pages
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <PickButton label="Take photo" capture onPick={add}>
            <Camera aria-hidden="true" size={20} strokeWidth={1.75} />
          </PickButton>
          <PickButton label="Upload photos or PDF" onPick={add}>
            <Upload aria-hidden="true" size={20} strokeWidth={1.75} />
          </PickButton>
        </div>
        <PageThumbnails
          files={files}
          onRemove={(at) => setFiles(files.filter((_, i) => i !== at))}
        />
        {tooMany ? (
          <p role="alert" className="text-danger">
            Add up to {MAX_PAGES_AT_ONCE} pages at a time. Read these first, then scan more.
          </p>
        ) : null}
        {scan.isError ? (
          <p role="alert" className="text-danger">
            {scan.error.message}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onBack} disabled={scan.isPending}>
            Back
          </Button>
          <span className="flex-1" />
          <Button
            disabled={files.length === 0}
            loading={scan.isPending}
            onClick={() => scan.mutate(files, { onSuccess: onRead })}
          >
            <Sparkles aria-hidden="true" size={16} strokeWidth={1.75} />
            {files.length === 1 ? 'Read 1 page' : `Read ${files.length || ''} pages`}
          </Button>
        </div>
      </section>
      <Tips />
    </div>
  );
}

function PageThumbnails({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  if (files.length === 0) return <p className="text-text-muted">No pages yet. Add one or more.</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${index}`}
          className="relative flex h-24 w-[76px] items-end justify-center rounded-md border border-border bg-[repeating-linear-gradient(var(--color-background)_0_13px,var(--color-border)_13px_14px)] pb-1.5"
        >
          <span className="rounded-sm bg-surface px-1.5 text-xs font-semibold">
            Page {index + 1}
          </span>
          <button
            type="button"
            aria-label={`Remove page ${index + 1}`}
            onClick={() => onRemove(index)}
            className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border border-border-strong bg-surface"
          >
            <X aria-hidden="true" size={12} strokeWidth={1.75} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Tips() {
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-surface-muted p-4">
      <h2 className="font-semibold">For the best results</h2>
      {tips.map((tip) => (
        <p key={tip} className="flex gap-2">
          <Check aria-hidden="true" size={16} strokeWidth={1.75} className="text-success" />
          {tip}
        </p>
      ))}
      <p className="mt-1 text-sm text-text-muted">
        Dakly reads Bangla and English handwriting and numbers. It won’t be perfect — you’ll check
        anything it’s unsure about.
      </p>
    </section>
  );
}

type PickButtonProps = {
  label: string;
  capture?: boolean;
  onPick: (event: ChangeEvent<HTMLInputElement>) => void;
  children: React.ReactNode;
};

function PickButton({ label, capture = false, onPick, children }: PickButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex h-24 flex-col items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-dashed border-border-strong bg-background font-semibold hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span className="text-primary">{children}</span>
        {label}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        multiple={!capture}
        accept="image/jpeg,image/png,application/pdf"
        capture={capture ? 'environment' : undefined}
        aria-label={label}
        onChange={onPick}
      />
    </>
  );
}
