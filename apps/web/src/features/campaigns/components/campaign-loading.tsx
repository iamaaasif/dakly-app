import { Skeleton } from '@dakly/ui/skeleton';

export function CampaignLoading() {
  return (
    <div className="p-6" role="status" aria-label="Loading campaign">
      <span className="sr-only">Loading campaign</span>
      <Skeleton className="h-40" />
    </div>
  );
}
