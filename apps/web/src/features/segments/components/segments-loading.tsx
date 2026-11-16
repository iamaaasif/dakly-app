import { Skeleton } from '@dakly/ui/skeleton';

export function SegmentsLoading() {
  return (
    <main className="space-y-4 p-4 md:p-8" role="status" aria-label="Loading segments">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </main>
  );
}
