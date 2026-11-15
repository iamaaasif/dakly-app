import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { Button } from '@dakly/ui/button';
export function CollapseNavigation({
  collapsed,
  onCollapse,
}: {
  collapsed?: boolean;
  onCollapse: () => void;
}) {
  return (
    <Button
      variant="secondary"
      className="mt-auto px-2"
      onClick={onCollapse}
      aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      aria-expanded={!collapsed}
    >
      {collapsed ? (
        <PanelLeftOpen aria-hidden="true" size={20} />
      ) : (
        <PanelLeftClose aria-hidden="true" size={20} />
      )}
      {!collapsed ? 'Collapse' : null}
    </Button>
  );
}
