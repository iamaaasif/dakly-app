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
          <Link href="/campaigns" className="text-action underline">
            Open all campaigns
          </Link>
          .
        </p>
      )}
    </StorePage>
  );
}
