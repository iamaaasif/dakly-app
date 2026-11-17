import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';

import { cn } from '@dakly/ui/cn';

export function CollapseNavigation({
  collapsed,
  onCollapse,
}: {
  collapsed?: boolean;
  onCollapse: () => void;
}) {
  return (
    <button
      type="button"
      className="flex min-h-10 min-w-10 items-center gap-3 rounded-md p-2 text-text-muted hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      onClick={onCollapse}
      aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      aria-expanded={!collapsed}
    >
      {collapsed ? (
        <PanelLeftOpen aria-hidden="true" size={20} strokeWidth={1.75} className="shrink-0" />
      ) : (
        <PanelLeftClose aria-hidden="true" size={20} strokeWidth={1.75} className="shrink-0" />
      )}
      <span className={cn(collapsed && 'sr-only')}>Collapse</span>
    </button>
  );
}
