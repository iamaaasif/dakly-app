import { Trophy } from 'lucide-react';
import Link from 'next/link';

import type { AnalyticsOverviewResponse } from '@dakly/contracts/analytics';
import { Card } from '@dakly/ui/card';

import { channelLabels } from '../analytics-labels';
import { formatWholeTaka } from '@/lib/format-money';

type Best = AnalyticsOverviewResponse['best'];

export function AnalyticsBestCards({ best }: { best: Best }) {
  return (
    <section aria-label="What worked best" className="grid gap-4 md:grid-cols-3">
      <BestCard title="Best campaign">
        <BestCampaign campaign={best.campaign} />
      </BestCard>
      <BestCard title="Best return">
        <BestChannel channel={best.channel} mostMoney={best.mostMoneyChannel} />
      </BestCard>
      <BestCard title="Best automation">
        <BestAutomation automation={best.automation} />
      </BestCard>
    </section>
  );
}

function BestCampaign({ campaign }: { campaign: Best['campaign'] }) {
  if (!campaign)
    return (
      <p className="text-text-muted">
        Send a campaign to 100 or more customers to see your best one.
      </p>
    );
  return (
    <>
      <Link href={`/campaigns/${campaign.id}`} className="font-semibold text-text hover:underline">
        {campaign.name}
      </Link>
      <p className="text-xl font-bold tabular-nums">
        {formatWholeTaka(BigInt(campaign.revenuePoisha))}
      </p>
      <p className="text-text-muted">
        {formatWholeTaka(BigInt(campaign.returnPerTaka) * 100n)} back for every ৳1
      </p>
    </>
  );
}

function BestChannel({
  channel,
  mostMoney,
}: {
  channel: Best['channel'];
  mostMoney: Best['mostMoneyChannel'];
}) {
  return (
    <>
      {channel ? (
        <>
          <p className="font-semibold">{channelLabels[channel.channel]}</p>
          <p className="text-xl font-bold tabular-nums">
            {formatWholeTaka(BigInt(channel.returnPerTaka) * 100n)} per ৳1
          </p>
        </>
      ) : (
        <p className="text-text-muted">Spend ৳500 or more on a paid channel to compare channels.</p>
      )}
      {channel && mostMoney && (
        <p className="text-text-muted">
          {channelLabels[mostMoney.channel]} earned the most money:{' '}
          {formatWholeTaka(BigInt(mostMoney.revenuePoisha))}
        </p>
      )}
    </>
  );
}

function BestAutomation({ automation }: { automation: Best['automation'] }) {
  if (!automation)
    return (
      <p className="text-text-muted">Turn on an automation to see which one earns the most.</p>
    );
  return (
    <>
      <Link
        href={`/automations/${automation.id}`}
        className="font-semibold text-text hover:underline"
      >
        {automation.name}
      </Link>
      <p className="text-xl font-bold tabular-nums">
        {formatWholeTaka(BigInt(automation.revenuePoisha))}
      </p>
    </>
  );
}

function BestCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-1">
      <h3 className="flex items-center gap-2 text-sm font-medium text-text-muted">
        <Trophy aria-hidden="true" size={16} strokeWidth={1.75} />
        {title}
      </h3>
      {children}
    </Card>
  );
}
