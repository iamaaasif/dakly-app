import { z } from 'zod';

import { SegmentsScreen } from '@/features/segments/components/segments-screen';
import { requireSession } from '@/lib/require-session';

const segmentsPageSchema = z.object({
  cursor: z.uuid().optional(),
  edit: z.union([z.literal('new'), z.uuid()]).optional(),
});

export default async function SegmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; edit?: string }>;
}) {
  const session = await requireSession();
  if (!session.currentStore)
    return (
      <p role="status" className="p-6">
        Choose a shop to see its segments.
      </p>
    );
  const parsed = segmentsPageSchema.safeParse(await searchParams);
  if (!parsed.success)
    return (
      <p role="alert" className="p-6">
        This segments page address is invalid. <a href="/segments">Open the segment list</a>.
      </p>
    );
  return (
    <SegmentsScreen
      cursor={parsed.data.cursor}
      edit={parsed.data.edit}
      canEdit={session.currentStore.canEditSegments}
    />
  );
}
