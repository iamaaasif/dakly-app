import { Skeleton } from '@dakly/ui/skeleton';

export default function LoadingCampaign() {
  return (
    <div className="p-6" role="status" aria-label="Loading campaign">
      <Skeleton className="h-40" />
    </div>
  );
}
