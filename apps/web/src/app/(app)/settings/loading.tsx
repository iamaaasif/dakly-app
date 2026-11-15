import { Skeleton } from '@dakly/ui/skeleton';

export default function Loading() {
  return (
    <div role="status" className="space-y-4 p-6">
      <p>Loading store settings…</p>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
