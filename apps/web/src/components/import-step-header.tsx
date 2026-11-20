import { cn } from '@dakly/ui/cn';

type ImportStepHeaderProps = { steps: readonly string[]; step: number };

export function ImportStepHeader({ steps, step }: ImportStepHeaderProps) {
  return (
    <>
      <p className="text-sm text-text-muted">
        Step {step + 1} of {steps.length} · {steps[step]}
      </p>
      <ol aria-hidden="true" className="my-4 grid auto-cols-fr grid-flow-col gap-1">
        {steps.map((name, index) => (
          <li
            key={name}
            className={cn('h-1 rounded-full', index <= step ? 'bg-action' : 'bg-surface-muted')}
          />
        ))}
      </ol>
    </>
  );
}
