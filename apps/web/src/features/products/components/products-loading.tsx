import { Skeleton } from '@dakly/ui/skeleton';

// Rows the same height as real ones, so the table does not jump when the data arrives.
export function ProductsLoading() {
  return (
    <div role="status" className="divide-y divide-border">
      <p className="sr-only">Loading products…</p>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex h-[72px] items-center gap-4 px-4">
          <Skeleton className="size-5 rounded-sm" />
          <Skeleton className="size-11 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40 max-w-full" />
            <Skeleton className="h-3 w-24 max-w-full" />
          </div>
          <Skeleton className="hidden h-4 w-16 md:block" />
          <Skeleton className="hidden h-6 w-32 md:block" />
        </div>
      ))}
    </div>
  );
}
