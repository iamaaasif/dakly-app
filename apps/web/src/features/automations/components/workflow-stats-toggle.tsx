import { Button } from '@dakly/ui/button';

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
