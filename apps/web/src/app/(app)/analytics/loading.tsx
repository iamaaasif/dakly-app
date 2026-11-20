import { Skeleton } from '@dakly/ui/skeleton';

export default function Loading() {
  return (
    <div role="status" className="space-y-4 p-6">
      <p>Loading Analytics…</p>
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
