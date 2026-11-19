import Link from 'next/link';

import { campaignListQuerySchema } from '@dakly/contracts/campaigns';

import { StorePage } from '@/components/store-page';
import { CampaignsScreen } from '@/features/campaigns/components/campaigns-screen';
import { requireSession } from '@/lib/require-session';

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const query = campaignListQuerySchema.safeParse(await searchParams);
  return (
    <StorePage permission="canViewCampaigns">
      {query.success ? (
        <CampaignsScreen query={query.data} />
      ) : (
        <p role="alert" className="p-6">
          The campaign filters are invalid.{' '}
          <Link
            href="/campaigns"
            className="inline-flex min-h-10 min-w-10 items-center text-action underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Open all campaigns
          </Link>
          .
        </p>
      )}
    </StorePage>
  );
}
