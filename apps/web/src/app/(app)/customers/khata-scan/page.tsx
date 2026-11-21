import { z } from 'zod';

import { KhataScanScreen } from '@/features/khata-scans/components/khata-scan-screen';
import { requireSession } from '@/lib/require-session';

// The pages being scanned and the open page tab live in the address, so a reload keeps them.
const khataScanQuerySchema = z.object({
  pages: z
    .string()
    .transform((value) => value.split(','))
    .pipe(z.array(z.uuid()).max(10))
    .catch([]),
  page: z.coerce.number().int().min(1).catch(1),
});

export default async function KhataScanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  if (!session.currentStore?.canCreateCustomer)
    return (
      <p role="status" className="p-6">
        You need permission to edit customers to scan a khata.
      </p>
    );
  const { pages, page } = khataScanQuerySchema.parse(await searchParams);
  return <KhataScanScreen pageIds={pages} activePage={page} />;
}
