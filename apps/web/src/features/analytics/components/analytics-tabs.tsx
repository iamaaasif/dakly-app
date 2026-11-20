import { CalendarDays, ChartLine, Layers, Megaphone, Zap } from 'lucide-react';
import Link from 'next/link';

import type { AnalyticsView } from '@dakly/contracts/analytics';
import { cn } from '@dakly/ui/cn';

import { analyticsHref } from '../api/analytics-overview';

const tabs = [
  { id: 'overview', label: 'Overview', icon: ChartLine },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { id: 'automations', label: 'Automations', icon: Zap },
  { id: 'channels', label: 'Channels', icon: Layers },
  { id: 'social', label: 'Social posts', icon: CalendarDays },
] as const;

export function AnalyticsTabs({ view }: { view: AnalyticsView }) {
  return (
    <nav aria-label="Analytics tabs" className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map(({ id, label, icon: Icon }) => (
        <Link
          key={id}
          href={analyticsHref({ ...view, tab: id })}
          aria-current={view.tab === id ? 'page' : undefined}
          // On a phone the row scrolls, so the open tab is brought into view.
          ref={(link) => {
            if (view.tab === id) link?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
          }}
          className={cn(
            '-mb-px inline-flex min-h-10 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-base text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            view.tab === id && 'border-action font-medium text-text',
          )}
        >
          <Icon aria-hidden="true" size={16} strokeWidth={1.75} className="hidden sm:block" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
