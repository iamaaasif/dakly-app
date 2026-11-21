import type { AnalyticsOverviewResponse, AnalyticsView } from '@dakly/contracts/analytics';
import type { AttributionSettingsResponse } from '@dakly/contracts/stores';
import { cn } from '@dakly/ui/cn';

import { AnalyticsAiAgentTab } from './analytics-ai-agent-tab';
import { AnalyticsAutomationsTab } from './analytics-automations-tab';
import { AnalyticsCampaignsTab } from './analytics-campaigns-tab';
import { AnalyticsChannelsTab } from './analytics-channels-tab';
import { AnalyticsHeadline } from './analytics-headline';
import { AnalyticsKeyFigures } from './analytics-key-figures';
import { AnalyticsOverviewTab } from './analytics-overview-tab';
import { AnalyticsRecalculatingBanner } from './analytics-recalculating-banner';
import { AnalyticsSocialTab } from './analytics-social-tab';
import { AnalyticsTabs } from './analytics-tabs';

type Props = {
  data: AnalyticsOverviewResponse;
  view: AnalyticsView;
  attribution: AttributionSettingsResponse | undefined;
  onOpenCounting: () => void;
};

export function AnalyticsReport({ data, view, attribution, onOpenCounting }: Props) {
  const isRebuilding = attribution?.rebuilding === true;
  return (
    <>
      {attribution && isRebuilding && <AnalyticsRecalculatingBanner settings={attribution} />}
      <div className={cn('space-y-6', isRebuilding && 'opacity-60')} aria-busy={isRebuilding}>
        <AnalyticsHeadline data={data} view={view} />
        <AnalyticsKeyFigures
          data={data}
          view={view}
          windowDays={attribution?.windowDays}
          onOpenCounting={onOpenCounting}
        />
        <AnalyticsTabs view={view} />
        <TabContent data={data} view={view} />
      </div>
    </>
  );
}

function TabContent({ data, view }: Pick<Props, 'data' | 'view'>) {
  if (view.tab === 'campaigns')
    return <AnalyticsCampaignsTab view={view} timeZone={data.timeZone} />;
  if (view.tab === 'automations') return <AnalyticsAutomationsTab view={view} />;
  if (view.tab === 'channels') return <AnalyticsChannelsTab view={view} />;
  if (view.tab === 'ai-agent') return <AnalyticsAiAgentTab view={view} />;
  if (view.tab === 'social') return <AnalyticsSocialTab view={view} timeZone={data.timeZone} />;
  return <AnalyticsOverviewTab data={data} view={view} />;
}
