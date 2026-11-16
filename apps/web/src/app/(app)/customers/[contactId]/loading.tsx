import { Skeleton } from '@dakly/ui/skeleton';

export default function LoadingCustomer() {
  return (
    <main
      className="mx-auto max-w-4xl space-y-6 p-4 md:p-8"
      role="status"
      aria-label="Loading customer"
    >
      <span className="sr-only">Loading customer</span>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </main>
  );
}
