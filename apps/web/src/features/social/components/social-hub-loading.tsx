import { Skeleton } from '@dakly/ui/skeleton';

export function SocialHubLoading() {
  return (
    <main className="space-y-4 p-4 md:p-8" role="status" aria-label="Loading social hub">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-48 w-full" />
    </main>
  );
}
