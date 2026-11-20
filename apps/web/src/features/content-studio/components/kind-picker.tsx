import { cn } from '@dakly/ui/cn';

import { kindChoices } from '../content-studio-labels';
import type { GenerateForm } from './generate-form-types';
import { StepHeading } from './step-heading';

export function KindPicker({ form }: { form: GenerateForm }) {
  const kind = form.watch('kind');
  return (
    <fieldset className="space-y-3">
      <legend>
        <StepHeading step={1}>What do you want to write?</StepHeading>
      </legend>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        {kindChoices.map(({ value, label, hint, icon: Icon, tile }) => (
          <label key={value} className="cursor-pointer">
            <input
              type="radio"
              name="kind"
              className="peer sr-only"
              checked={kind === value}
              onChange={() => form.setValue('kind', value)}
            />
            <span
              className={cn(
                'flex h-full items-center gap-3 rounded-lg border border-border p-3',
                'peer-checked:border-primary peer-checked:ring-1 peer-checked:ring-primary',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
              )}
            >
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-md', tile)}>
                <Icon aria-hidden="true" size={18} strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-text-muted">{hint}</span>
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
