import type { PostingSlot } from '@dakly/contracts/social';
import { Button } from '@dakly/ui/button';

import { useRecommendedSlots } from '../api/get-recommended-slots';

export function RecommendedTimes({ onUse }: { onUse: (slots: PostingSlot[]) => void }) {
  const recommend = useRecommendedSlots();
  return (
    <div className="mb-4">
      <Button
        variant="secondary"
        loading={recommend.isPending}
        onClick={() => recommend.mutate(undefined, { onSuccess: ({ slots }) => onUse(slots) })}
      >
        Use recommended times
      </Button>
      {recommend.isSuccess && (
        <p role="status" className="mt-2 text-sm text-text-muted">
          {recommend.data.basis === 'orders'
            ? 'Based on the hours your orders come in, over the last 30 days. Save to keep them.'
            : 'Standard times, because there are not enough recent orders yet. Save to keep them.'}
        </p>
      )}
      {recommend.isError && (
        <p role="alert" className="mt-2 text-danger">
          {recommend.error.message}
        </p>
      )}
    </div>
  );
}
