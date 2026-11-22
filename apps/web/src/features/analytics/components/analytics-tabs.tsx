'use client';

import { Bot, CalendarDays, ChartLine, Layers, Megaphone, PiggyBank, Zap } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { AnalyticsView } from '@dakly/contracts/analytics';
import { cn } from '@dakly/ui/cn';

import { analyticsHref } from '../api/analytics-overview';
import { UrlLink } from '@/components/url-link';

const tabs = [
  { id: 'overview', label: 'Overview', icon: ChartLine },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { id: 'automations', label: 'Automations', icon: Zap },
  { id: 'channels', label: 'Channels', icon: Layers },
  { id: 'social', label: 'Social posts', icon: CalendarDays },
  { id: 'ai-agent', label: 'AI agent', icon: Bot },
  { id: 'profit', label: 'Profit', icon: PiggyBank },
] as const;

export function AnalyticsTabs({ view }: { view: AnalyticsView }) {
  const row = useRef<HTMLElement>(null);
  useEffect(() => {
    centerOpenTab(row.current);
    // Web fonts change the tab widths once they load.
    void document.fonts?.ready.then(() => centerOpenTab(row.current));
  }, [view.tab]);
  return (
    <nav
      aria-label="Analytics tabs"
      ref={row}
      className="flex gap-1 overflow-x-auto border-b border-border"
    >
      {tabs.map(({ id, label, icon: Icon }) => (
        <UrlLink
          key={id}
          href={analyticsHref({ ...view, tab: id })}
          aria-current={view.tab === id ? 'page' : undefined}
          className={cn(
            '-mb-px inline-flex min-h-10 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-base text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            view.tab === id && 'border-action font-medium text-text',
          )}
        >
          <Icon aria-hidden="true" size={16} strokeWidth={1.75} className="hidden sm:block" />
          {label}
        </UrlLink>
      ))}
    </nav>
  );
}

// On a phone the row scrolls sideways, so the open tab is centred. Only the row scrolls, never the page.
function centerOpenTab(row: HTMLElement | null) {
  const open = row?.querySelector<HTMLElement>('[aria-current="page"]');
  if (row && open) row.scrollLeft = open.offsetLeft - (row.clientWidth - open.offsetWidth) / 2;
}
