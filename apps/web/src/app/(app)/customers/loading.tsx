import { Card } from '@dakly/ui/card';
import { Skeleton } from '@dakly/ui/skeleton';

export default function LoadingCustomers() {
  return (
    <main
      className="mx-auto max-w-2xl space-y-6 p-6 md:p-8"
      role="status"
      aria-label="Loading customers"
    >
      <span className="sr-only">Loading customers</span>
      <Skeleton className="h-8 w-40" />
      <Card className="space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-40" />
      </Card>
    </main>
  );
}
