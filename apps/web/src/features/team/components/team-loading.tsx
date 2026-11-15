import { Skeleton } from '@dakly/ui/skeleton';

export function TeamLoading() {
  return (
    <div role="status" className="space-y-4 p-6">
      <p>Loading team…</p>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
