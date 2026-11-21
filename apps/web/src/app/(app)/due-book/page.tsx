import { z } from 'zod';

import { dueListFilters } from '@dakly/contracts/due-book';

import { DueBookScreen } from '@/features/due-book/components/due-book-screen';
import { requireSession } from '@/lib/require-session';

const dueBookQuerySchema = z.object({ filter: z.enum(dueListFilters).catch('all') });

export default async function DueBookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  if (!session.currentStore?.canViewDueBook)
    return (
      <p role="status" className="p-6">
        You do not have Due book access in this shop.
      </p>
    );
  const { filter } = dueBookQuerySchema.parse(await searchParams);
  return <DueBookScreen filter={filter} />;
}
