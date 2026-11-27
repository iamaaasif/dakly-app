import { Button } from '@dakly/ui/button';
import { DropdownMenuCheckboxItem } from '@dakly/ui/dropdown-menu';

import { useStepStats } from '../api/automations';
import { useCanvasParam } from '../use-canvas-param';

type Props = { on: boolean; failed: boolean; onChange: (on: boolean) => void };

export function WorkflowStatsToggle({ on, failed, onChange }: Props) {
  return (
    <Button
      variant="secondary"
      className="rounded-none border-0 border-l border-border whitespace-nowrap"
      aria-pressed={on}
      onClick={() => onChange(!on)}
    >
      {failed && on ? 'Could not load stats' : 'Show stats'}
    </Button>
  );
}

// The editor has no zoom-bar button; the toggle lives in the header's pencil menu.
export function WorkflowStatsMenuItem({ id }: { id: string }) {
  const [value, setValue] = useCanvasParam('stats');
  const on = value === '1';
  const query = useStepStats(id, on);
  return (
    <DropdownMenuCheckboxItem checked={on} onCheckedChange={(next) => setValue(next ? '1' : null)}>
      {query.isError && on ? 'Could not load stats' : 'Show stats'}
    </DropdownMenuCheckboxItem>
  );
}
