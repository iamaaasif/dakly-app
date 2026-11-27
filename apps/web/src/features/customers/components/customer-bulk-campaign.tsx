'use client';
import { useRouter } from 'next/navigation';

import { Button } from '@dakly/ui/button';
import { useToast } from '@dakly/ui/toast';

import { useCreateHandPickedSegment } from '../api/hand-picked-segments';
import { formatDateTime } from '@/lib/format-date';

type CustomerBulkCampaignProps = { contactIds: string[] };

// Saves the ticked customers as a segment and opens the campaign builder with it chosen, so the
// audience step applies the same consent and frequency checks as any other segment.
export function CustomerBulkCampaign({ contactIds }: CustomerBulkCampaignProps) {
  const router = useRouter();
  const showToast = useToast();
  const create = useCreateHandPickedSegment();
  const start = () =>
    create.mutate(
      {
        name: `Picked ${formatDateTime(new Date().toISOString()).replace(' (Asia/Dhaka)', '')}`,
        contactIds,
      },
      {
        onSuccess: (segment) => router.push(`/campaigns/new?segment=${segment.id}`),
        onError: (error) => showToast(error.message),
      },
    );
  return (
    <Button
      variant="link"
      disabled={create.isPending}
      onClick={start}
      className="px-3 text-on-primary hover:no-underline"
    >
      Send campaign
    </Button>
  );
}
