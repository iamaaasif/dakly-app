import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

// Rows shaped like the final ones, so the tab does not jump when data arrives.
export function RowsSkeleton({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div role="status" className="space-y-3">
      <p className="sr-only">{label}</p>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

export function PartError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return <QueryError message={error.message} onRetry={onRetry} retryLabel="Retry" />;
}

export function PartEmpty({ children }: { children: string }) {
  return <p className="py-6 text-center text-sm text-text-muted">{children}</p>;
}

type MoreProps = { hasNext: boolean; loading: boolean; onMore: () => void };

export function LoadMore({ hasNext, loading, onMore }: MoreProps) {
  if (!hasNext) return null;
  return (
    <div className="pt-4 text-center">
      <Button variant="secondary" loading={loading} onClick={onMore}>
        Show more
      </Button>
    </div>
  );
}
