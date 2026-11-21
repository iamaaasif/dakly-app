import { useState, type ReactNode } from 'react';

import type { KhataPageResponse } from '@dakly/contracts/khata-scans';
import { cn } from '@dakly/ui/cn';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useKhataImports } from '../api/khata-imports';
import { useKhataPages } from '../api/khata-page';
import { KhataDoneStep } from './khata-done-step';
import { KhataReadingStep } from './khata-reading-step';
import { KhataPageProblem, KhataReviewPage, type PageImport } from './khata-review-page';

type ScanStageProps = {
  pageIds: string[];
  activePage: number;
  onActivePage: (page: number) => void;
  onScanMore: () => void;
};

// One stage covers reading, review and the result, because they all follow from what the pages say.
export function KhataScanStage({ pageIds, activePage, onActivePage, onScanMore }: ScanStageProps) {
  const queries = useKhataPages(pageIds);
  const pastImports = useKhataImports();
  const [imported, setImported] = useState<Record<string, PageImport>>({});
  const failed = queries.find((query) => query.isError);
  if (failed?.isError)
    return <QueryError message={failed.error.message} onRetry={() => void failed.refetch()} />;
  const pages = queries.flatMap((query) => (query.data ? [query.data] : []));
  if (pages.length < pageIds.length || pastImports.isPending)
    return <Skeleton className="h-64 w-full" />;

  const waiting = pages.filter((page) => page.status === 'uploaded' || page.status === 'reading');
  if (waiting.length > 0)
    return <KhataReadingStep current={waiting.length === pages.length ? 1 : 2} />;
  // A reload loses the local result, so the server's list says which pages were already imported.
  const importedBefore = new Set(
    (pastImports.data ?? []).filter((item) => item.status === 'done').map((item) => item.pageId),
  );
  const finished = pages.every(
    (page) => page.status !== 'read' || imported[page.id] || importedBefore.has(page.id),
  );
  if (finished && Object.keys(imported).length > 0)
    return <KhataDoneStep imports={Object.values(imported)} onScanMore={onScanMore} />;
  return (
    <PageTabs
      pages={pages}
      active={Math.min(activePage, pages.length) - 1}
      onActive={(index) => onActivePage(index + 1)}
      imported={imported}
      importedBefore={importedBefore}
      onImported={(pageId, done) => setImported((current) => ({ ...current, [pageId]: done }))}
    />
  );
}

type PageTabsProps = {
  pages: KhataPageResponse[];
  active: number;
  onActive: (index: number) => void;
  imported: Record<string, PageImport>;
  importedBefore: Set<string>;
  onImported: (pageId: string, done: PageImport) => void;
};

function PageTabs({
  pages,
  active,
  onActive,
  imported,
  importedBefore,
  onImported,
}: PageTabsProps) {
  const tabs =
    pages.length > 1 ? (
      <div className="flex flex-wrap gap-1.5">
        {pages.map((page, index) => (
          <button
            key={page.id}
            type="button"
            aria-pressed={index === active}
            onClick={() => onActive(index)}
            className={cn(
              'min-h-7 rounded-md border px-2.5 text-sm font-semibold',
              index === active
                ? 'border-inverse bg-inverse text-on-primary'
                : 'border-border-strong bg-surface',
            )}
          >
            Page {index + 1}
            {imported[page.id] || importedBefore.has(page.id) ? ' · imported' : ''}
          </button>
        ))}
      </div>
    ) : null;
  return (
    <>
      {pages.map((page, index) => (
        <div key={page.id} hidden={index !== active}>
          <PagePanel
            page={page}
            tabs={tabs}
            imported={imported[page.id] ?? (importedBefore.has(page.id) ? 'before' : undefined)}
            onImported={onImported}
          />
        </div>
      ))}
    </>
  );
}

type PagePanelProps = {
  page: KhataPageResponse;
  tabs: ReactNode;
  imported: PageImport | 'before' | undefined;
  onImported: (pageId: string, done: PageImport) => void;
};

// The tabs sit in the photo card on the review screen, as in the design; the other states have no card.
function PagePanel({ page, tabs, imported, onImported }: PagePanelProps) {
  if (page.status === 'read' && !imported)
    return (
      <KhataReviewPage page={page} tabs={tabs} onImported={(done) => onImported(page.id, done)} />
    );
  return (
    <div className="flex flex-col gap-4">
      {tabs}
      {page.status === 'read' ? (
        <p role="status" className="rounded-lg bg-success-soft p-4 text-success">
          This page is imported.
        </p>
      ) : (
        <KhataPageProblem page={page} />
      )}
    </div>
  );
}
