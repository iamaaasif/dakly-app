import { Skeleton } from '@dakly/ui/skeleton';

export default function LoadingCustomers() {
  return (
    <main
      className="mx-auto max-w-6xl space-y-6 p-4 md:p-8"
      role="status"
      aria-label="Loading customers"
    >
      <span className="sr-only">Loading customers</span>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </main>
  );
}
