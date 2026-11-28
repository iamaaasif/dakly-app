import { Check } from 'lucide-react';

import { cn } from '@dakly/ui/cn';

import type { MyPostsTab } from '../use-my-posts-params';

type MyPostsTabsProps = {
  tab: MyPostsTab;
  counts: Record<MyPostsTab, number>;
  onTab: (tab: MyPostsTab) => void;
};

const tabs = [
  { value: 'calendar', label: 'Calendar' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
] as const;

export function MyPostsTabs({ tab, counts, onTab }: MyPostsTabsProps) {
  return (
    <div role="tablist" aria-label="My posts" className="flex gap-1 border-b border-border">
      {tabs.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={tab === value}
          onClick={() => onTab(value)}
          className={cn(
            '-mb-px flex min-h-10 items-center gap-2 border-b-2 px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            tab === value
              ? 'border-action font-medium text-text'
              : 'border-transparent text-text-muted hover:text-text',
          )}
        >
          {tab === value && (
            <Check aria-hidden="true" size={16} strokeWidth={2} className="text-action" />
          )}
          {label}
          <span className="text-sm text-text-muted tabular-nums">{counts[value]}</span>
        </button>
      ))}
    </div>
  );
}
