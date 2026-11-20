import { Skeleton } from '@dakly/ui/skeleton';

export function IntegrationsLoading() {
  return (
    <main className="space-y-4 p-4 md:p-8" role="status" aria-label="Loading integrations">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </main>
  );
}
