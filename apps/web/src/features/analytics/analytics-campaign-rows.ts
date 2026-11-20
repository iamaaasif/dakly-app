import type { AnalyticsCampaignRow, AnalyticsView } from '@dakly/contracts/analytics';

const byColumn: Record<
  AnalyticsView['sort'],
  (a: AnalyticsCampaignRow, b: AnalyticsCampaignRow) => number
> = {
  name: (a, b) => a.name.localeCompare(b.name),
  date: (a, b) => b.startedAt.localeCompare(a.startedAt),
  sent: (a, b) => b.sent - a.sent,
  tapped: (a, b) => (b.tapPercent ?? -1) - (a.tapPercent ?? -1),
  orders: (a, b) => b.orders - a.orders,
  earned: (a, b) => (BigInt(b.revenuePoisha) > BigInt(a.revenuePoisha) ? 1 : -1),
  return: (a, b) => (b.returnPerTaka ?? -1) - (a.returnPerTaka ?? -1),
};

export function visibleCampaigns(
  rows: AnalyticsCampaignRow[],
  { sort, channel, search }: Pick<AnalyticsView, 'sort' | 'channel' | 'search'>,
) {
  const needle = search.trim().toLowerCase();
  return rows
    .filter((row) => channel === 'all' || row.channel === channel)
    .filter((row) => row.name.toLowerCase().includes(needle))
    .sort(byColumn[sort]);
}
