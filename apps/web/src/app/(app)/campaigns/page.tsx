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
  const { pageShop, ...filters } = await searchParams;
  const query = campaignListQuerySchema.safeParse(filters);
  const cursorShop = typeof pageShop === 'string' ? pageShop : undefined;
  return query.success ? (
    <CampaignsScreen query={query.data} cursorShop={cursorShop} />
  ) : (
    <StorePage permission="canViewCampaigns">
      <p role="alert" className="p-6">
        The campaign filters are invalid.{' '}
        <Link href="/campaigns" className="text-action underline">
          Open all campaigns
        </Link>
        .
      </p>
    </StorePage>
  );
}
