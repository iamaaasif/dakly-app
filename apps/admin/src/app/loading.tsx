import { Skeleton } from '@dakly/ui/skeleton';

export default function Loading() {
  return (
    <main className="mx-auto max-w-lg p-6">
      <Skeleton className="h-40 w-full" />
    </main>
  );
}
