import { memberListQuerySchema } from '@dakly/contracts/team';

import { TeamScreen } from '@/features/team/components/team-screen';
import { requireSession } from '@/lib/require-session';

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; cursor?: string }>;
}) {
  const session = await requireSession();
  if (!session.currentStore?.canViewTeam)
    return (
      <p role="status" className="p-6">
        You do not have Team access in this shop.
      </p>
    );
  const query = await searchParams;
  const parsed = memberListQuerySchema.safeParse({ cursor: query.cursor });
  if (!parsed.success)
    return (
      <p role="alert" className="p-6">
        This team page address is invalid. <a href="/team">Open the first page</a>.
      </p>
    );
  return (
    <TeamScreen tab={query.tab === 'roles' ? 'roles' : 'members'} cursor={parsed.data.cursor} />
  );
}
