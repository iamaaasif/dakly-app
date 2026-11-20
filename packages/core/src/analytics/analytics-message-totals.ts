import type { AutomationsService } from '../automations/automations.service';
import type { CampaignsService } from '../campaigns/campaigns.service';

export type Totals = { sent: number; delivered: number; read: number; cost: bigint };

export function emptyTotals(): Totals {
  return { sent: 0, delivered: 0, read: 0, cost: 0n };
}

export function sumTotals(rows: Totals[]): Totals {
  return rows.reduce(
    (sum, row) => ({
      sent: sum.sent + row.sent,
      delivered: sum.delivered + row.delivered,
      read: sum.read + row.read,
      cost: sum.cost + row.cost,
    }),
    emptyTotals(),
  );
}

// Messages from campaigns and workflows added together, one total per channel.
export async function readMessageTotals(
  campaigns: CampaignsService,
  automations: AutomationsService,
  storeId: string,
  range: { from: string; through: string; timeZone: string },
) {
  const [fromCampaigns, fromAutomations] = await Promise.all([
    campaigns.messageTotals(storeId, range),
    automations.messageTotals(storeId, range),
  ]);
  const totals = new Map<string, Totals>();
  for (const row of [...fromCampaigns, ...fromAutomations]) {
    const known = totals.get(row.channel) ?? emptyTotals();
    totals.set(row.channel, sumTotals([known, { ...row, cost: BigInt(row.costPoisha) }]));
  }
  return totals;
}
