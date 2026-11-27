import { Skeleton } from '@dakly/ui/skeleton';

// Rows the same height as real ones, so the list does not jump when the data arrives.
export function OrdersLoading({ label }: { label: string }) {
  return (
    <div role="status" className="divide-y divide-border">
      <p className="sr-only">Loading {label}…</p>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex min-h-[69px] items-center gap-3 px-4 py-3 md:gap-4">
          <Skeleton className="size-9 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-44 max-w-full" />
            <Skeleton className="h-3 w-28 max-w-full" />
          </div>
          <div className="hidden space-y-2 md:block">
            <Skeleton className="ml-auto h-3.5 w-16" />
            <Skeleton className="ml-auto h-3 w-20" />
          </div>
          <Skeleton className="h-9 w-20 md:w-24" />
        </div>
      ))}
    </div>
  );
}
