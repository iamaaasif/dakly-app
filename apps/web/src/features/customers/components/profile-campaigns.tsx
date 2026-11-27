import { useCustomerCampaigns } from '../api/customer-profile';
import { campaignResultLabels, channelLabels } from '../customer-labels';
import { LoadMore, PartEmpty, PartError, RowsSkeleton } from './profile-parts';
import { formatShortDate } from '@/lib/format-date';

export function ProfileCampaigns({ contactId }: { contactId: string }) {
  const campaigns = useCustomerCampaigns(contactId);
  if (campaigns.error)
    return <PartError error={campaigns.error} onRetry={() => void campaigns.refetch()} />;
  if (campaigns.isPending) return <RowsSkeleton label="Loading campaigns" />;
  const rows = campaigns.data.pages.flatMap((page) => page.items);
  if (!rows.length) return <PartEmpty>No campaign has reached this customer yet.</PartEmpty>;
  return (
    <>
      <ul>
        {rows.map((row) => (
          <li
            key={row.recipientId}
            className="grid gap-x-4 border-b border-border py-3 last:border-b-0 sm:grid-cols-[1.4fr_1fr_1fr]"
          >
            <span className="text-base font-semibold break-words">{row.name}</span>
            <span className="text-sm text-text-secondary tabular-nums">
              {channelLabels[row.channel]} · {formatShortDate(row.at)}
            </span>
            <span
              className={`text-sm font-semibold ${row.result === 'tapped' ? 'text-action-hover' : 'text-text'}`}
            >
              {campaignResultLabels[row.result]}
            </span>
          </li>
        ))}
      </ul>
      <LoadMore
        hasNext={campaigns.hasNextPage}
        loading={campaigns.isFetchingNextPage}
        onMore={() => void campaigns.fetchNextPage()}
      />
    </>
  );
}
