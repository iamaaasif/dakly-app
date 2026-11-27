import Link from 'next/link';

import { SegmentsScreen } from '@/features/segments/components/segments-screen';
import { parseSegmentsView } from '@/features/segments/segments-view';
import { requireSession } from '@/lib/require-session';

export default async function SegmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  if (!session.currentStore)
    return (
      <p role="status" className="p-6">
        Choose a shop to see its segments.
      </p>
    );
  const view = parseSegmentsView(await searchParams);
  if (!view)
    return (
      <p role="alert" className="p-6">
        This segments page address is invalid. <Link href="/segments">Open the segment list</Link>.
      </p>
    );
  return <SegmentsScreen view={view} canEdit={session.currentStore.canEditSegments} />;
}
