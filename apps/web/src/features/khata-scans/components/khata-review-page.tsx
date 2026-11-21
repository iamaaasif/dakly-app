import { TriangleAlert, Check } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import type { KhataImportResponse, KhataPageResponse } from '@dakly/contracts/khata-scans';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

import { useImportKhataPage } from '../api/import-khata-page';
import { useReadKhataPageAgain } from '../api/scan-khata-pages';
import {
  buildImportInput,
  describeImported,
  needsAttention,
  untouchedChoice,
  type RowChoice,
} from '../khata-review';
import { KhataRow, rowColumns } from './khata-row';

export type PageImport = {
  result: KhataImportResponse;
  matched: number;
  walkIn: number;
};

type ReviewPageProps = { page: KhataPageResponse; onImported: (done: PageImport) => void };

export function KhataReviewPage({ page, onImported }: ReviewPageProps) {
  const [choices, setChoices] = useState<Record<string, RowChoice>>({});
  const importPage = useImportKhataPage(page.id);
  const choiceOf = (rowId: string) => choices[rowId] ?? untouchedChoice;
  const waiting = page.rows.filter((row) => needsAttention(row, choiceOf(row.id))).length;
  const toImport = page.rows.filter((row) => !choiceOf(row.id).skipped).length;
  const submit = () =>
    importPage.mutate(buildImportInput(page.rows, choices), {
      onSuccess: (result) => onImported({ result, ...describeImported(page.rows, choices) }),
    });
  const change = (rowId: string, patch: Partial<RowChoice>) =>
    setChoices((current) => ({
      ...current,
      [rowId]: { ...(current[rowId] ?? untouchedChoice), ...patch },
    }));

  return (
    <div className="flex flex-col gap-4">
      <ReviewBanner
        waiting={waiting}
        toImport={toImport}
        loading={importPage.isPending}
        onImport={submit}
      />
      {importPage.isError ? (
        <p role="alert" className="text-danger">
          {importPage.error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-4">
        <PagePhoto page={page} />
        <RowTable rows={page.rows} choiceOf={choiceOf} onChange={change} />
      </div>
    </div>
  );
}

type ReviewBannerProps = {
  waiting: number;
  toImport: number;
  loading: boolean;
  onImport: () => void;
};

function ReviewBanner({ waiting, toImport, loading, onImport }: ReviewBannerProps) {
  const Icon = waiting ? TriangleAlert : Check;
  const rows = toImport === 1 ? 'row' : 'rows';
  const need = waiting === 1 ? 'row needs' : 'rows need';
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2.5 rounded-lg px-3.5 py-2.5',
        waiting ? 'bg-warning-soft' : 'bg-success-soft',
      )}
    >
      <Icon
        aria-hidden="true"
        size={16}
        strokeWidth={1.75}
        className={waiting ? 'text-warning' : 'text-success'}
      />
      <p role="status" className="min-w-48 flex-1">
        {waiting
          ? `${waiting} ${need} checking. Yellow boxes are the parts Dakly wasn’t sure about.`
          : 'Everything is checked. Ready to import.'}
      </p>
      <Button disabled={waiting > 0 || toImport === 0} loading={loading} onClick={onImport}>
        Import {toImport} {rows}
      </Button>
    </div>
  );
}

type RowTableProps = {
  rows: KhataPageResponse['rows'];
  choiceOf: (rowId: string) => RowChoice;
  onChange: (rowId: string, patch: Partial<RowChoice>) => void;
};

function RowTable({ rows, choiceOf, onChange }: RowTableProps) {
  return (
    <div className="min-w-0 flex-[999_1_600px] overflow-x-auto rounded-lg border border-border bg-surface">
      <div className="min-w-[840px]">
        <div
          className={cn(
            rowColumns,
            'border-b border-border bg-background px-3 py-2.5 text-xs font-semibold text-text-muted',
          )}
        >
          {['Date', 'Customer', 'Phone', 'Product', 'Amount', 'Sure?', 'Status'].map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
        <ul>
          {rows.map((row) => (
            <KhataRow
              key={row.id}
              row={row}
              choice={choiceOf(row.id)}
              onChange={(patch) => onChange(row.id, patch)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function PagePhoto({ page }: { page: KhataPageResponse }) {
  return (
    <figure className="flex min-w-0 flex-[1_1_260px] flex-col gap-2.5 rounded-lg border border-border bg-surface p-3">
      {page.photoUrl ? (
        <Image
          src={page.photoUrl}
          alt="Your khata page"
          width={600}
          height={800}
          unoptimized
          className="max-h-[420px] w-full rounded-md border border-border object-contain"
        />
      ) : (
        <p className="flex min-h-[260px] items-center justify-center rounded-md border border-border bg-surface-muted p-4 text-center text-text-muted">
          The photo is deleted 30 days after the scan. The rows stay.
        </p>
      )}
      <figcaption className="text-xs text-text-muted">Your photo</figcaption>
    </figure>
  );
}

const unreadableText: Record<string, string> = {
  allowance: 'Your plan has no khata pages left for this period.',
  model: 'Dakly could not read this page just now. Try again.',
};

export function KhataPageProblem({ page }: { page: KhataPageResponse }) {
  const again = useReadKhataPageAgain(page.id);
  const message =
    page.status === 'unreadable'
      ? 'Dakly could not find any rows on this page. Retake it in good light, with the whole page in view.'
      : (unreadableText[page.failureCode ?? 'model'] ?? unreadableText.model);
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg bg-danger-soft p-4 text-danger"
    >
      <p className="min-w-48 flex-1">{message}</p>
      {page.status === 'failed' ? (
        <Button variant="secondary" loading={again.isPending} onClick={() => again.mutate()}>
          Read again
        </Button>
      ) : null}
    </div>
  );
}
