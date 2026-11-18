import { Skeleton } from '@dakly/ui/skeleton';

export function ProductsLoading() {
  return (
    <div role="status" className="space-y-4 p-4">
      <p>Loading products…</p>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
