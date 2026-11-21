import { cn } from '@dakly/ui/cn';

type ImportStepHeaderProps = {
  steps: readonly string[];
  step: number;
  // The design names every step under its bar; on a phone the line above already does.
  nameEachStep?: boolean;
};

export function ImportStepHeader({ steps, step, nameEachStep = false }: ImportStepHeaderProps) {
  return (
    <>
      <p className="text-sm text-text-muted">
        Step {step + 1} of {steps.length} · {steps[step]}
      </p>
      <ol aria-hidden="true" className="my-4 grid auto-cols-fr grid-flow-col gap-1">
        {steps.map((name, index) => (
          <li key={name}>
            <div
              className={cn('h-1 rounded-full', index <= step ? 'bg-action' : 'bg-surface-muted')}
            />
            {nameEachStep ? (
              <span
                className={cn(
                  'mt-2 hidden text-xs sm:block',
                  index === step ? 'font-semibold text-action' : 'text-text-muted',
                )}
              >
                {name}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </>
  );
}
