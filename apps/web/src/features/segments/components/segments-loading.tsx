import { Skeleton } from '@dakly/ui/skeleton';
import { TableCard } from '@dakly/ui/table';

// Same row height as a real row, so the table does not jump when the data arrives.
export function SegmentRowsLoading() {
  return (
    <div role="status" aria-label="Loading segments" className="divide-y divide-border">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex h-14 items-center gap-4 px-4">
          <Skeleton className="size-5 rounded-sm" />
          <Skeleton className="h-3.5 w-40 max-w-[50%]" />
          <Skeleton className="ml-auto h-3.5 w-20 md:ml-[12%]" />
          <Skeleton className="hidden h-3.5 w-40 md:block" />
        </div>
      ))}
    </div>
  );
}

export function SegmentsLoading() {
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <TableCard>
        <Skeleton className="m-3 h-10 w-full max-w-72" />
        <SegmentRowsLoading />
      </TableCard>
    </main>
  );
}
