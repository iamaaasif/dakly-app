import { memberListQuerySchema } from '@dakly/contracts/team';

import { OwnershipScreen } from '@/features/team/components/ownership-screen';
import { requireSession } from '@/lib/require-session';

export default async function OwnershipPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const session = await requireSession();
  if (!session.currentStore)
    return (
      <p role="status" className="p-6">
        Choose a shop to view ownership transfers.
      </p>
    );
  const query = memberListQuerySchema.safeParse(await searchParams);
  if (!query.success)
    return (
      <p role="alert">
        This page address is invalid. <a href="/team/ownership">Open the first page</a>.
      </p>
    );
  return <OwnershipScreen cursor={query.data.cursor} />;
}
