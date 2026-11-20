import { cn } from '@dakly/ui/cn';
import { Label } from '@dakly/ui/label';
import { Textarea } from '@dakly/ui/textarea';

import { topicIdeas } from '../content-studio-labels';
import type { GenerateForm } from './generate-form-types';
import { StepHeading } from './step-heading';

export function TopicFields({ form }: { form: GenerateForm }) {
  const idea = form.watch('idea');
  return (
    <div className="space-y-3">
      <StepHeading step={2}>What’s it about?</StepHeading>
      <div className="flex flex-wrap gap-2">
        {topicIdeas.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={idea === value}
            onClick={() => form.setValue('idea', idea === value ? null : value)}
            className={cn(
              'min-h-10 rounded-full border border-input-border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              idea === value && 'border-primary bg-primary-soft text-action',
            )}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

export function NotesField({ form }: { form: GenerateForm }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="content-notes">
        Anything else Dakly should know?{' '}
        <span className="block text-xs font-normal text-text-muted">Optional</span>
      </Label>
      <Textarea
        id="content-notes"
        rows={3}
        maxLength={1900}
        placeholder="e.g. New winter kurtis in 8 colours, soft cotton"
        {...form.register('notes')}
      />
    </div>
  );
}
