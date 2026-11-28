import { Skeleton } from '@dakly/ui/skeleton';

// Blocks about as tall as the real greeting, overview, setup card and task panels, so the
// page does not move when the data arrives.
export function DashboardSkeleton() {
  return (
    <div role="status" className="space-y-5">
      <p className="sr-only">Loading your dashboard…</p>
      <header className="space-y-1.5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-72 max-w-full" />
      </header>
      <Skeleton className="h-52 w-full rounded-lg @min-[920px]/dashboard:h-44" />
      <Skeleton className="h-96 w-full rounded-lg @min-[830px]/dashboard:h-80" />
      <div className="grid min-w-0 items-start gap-6 @min-[920px]/dashboard:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Skeleton className="h-72 w-full rounded-lg" />
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    </div>
  );
}
