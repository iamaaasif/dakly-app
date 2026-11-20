import { ChevronRight, Sparkles } from 'lucide-react';

import type { ContentWriteResult } from '@dakly/contracts/content-writing';

import { kindChoices, kindLabel, startIdeas } from '../content-studio-labels';
import type { GenerateForm, GenerateInput } from './generate-form-types';
import { ResultCard } from './result-card';

type WrittenOptionsProps = {
  result: ContentWriteResult | undefined;
  asked: GenerateInput | null;
  form: GenerateForm;
};

export function WrittenOptions({ result, asked, form }: WrittenOptionsProps) {
  if (!result || !asked) return <StartPanel form={form} />;
  return (
    <section aria-labelledby="options-heading" className="space-y-3">
      <div>
        <h2 id="options-heading" className="text-lg font-semibold">
          3 options for your {kindLabel(asked.kind).toLowerCase()}
        </h2>
        <p className="text-text-muted">
          Edit any of them, then use, copy or save it. Uses 3 AI credits per set.
        </p>
      </div>
      <ul aria-label="Written options" className="space-y-3">
        {result.options.map((option, index) => (
          <li key={`${result.aiRunId}-${index}`}>
            <ResultCard number={index + 1} text={option} aiRunId={result.aiRunId} asked={asked} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function KindIcon({ kind }: { kind: GenerateInput['kind'] }) {
  const { icon: Icon, tile } = kindChoices.find(({ value }) => value === kind)!;
  return (
    <span aria-hidden="true" className={`rounded grid size-6 place-items-center ${tile}`}>
      <Icon size={14} strokeWidth={1.75} />
    </span>
  );
}

function StartPanel({ form }: { form: GenerateForm }) {
  return (
    <section className="space-y-5 rounded-lg border border-border bg-surface p-6 text-center">
      <span className="rounded-xl mx-auto grid size-12 place-items-center bg-primary-soft text-action">
        <Sparkles aria-hidden="true" size={22} strokeWidth={1.75} />
      </span>
      <div>
        <h2 className="text-lg font-semibold">Your writing will appear here</h2>
        <p className="mt-1 text-text-muted">
          Choose what to make on the left, add a few details, and Dakly writes 3 options in your
          brand voice.
        </p>
      </div>
      <div className="space-y-2 text-left">
        <p className="text-center text-xs font-semibold tracking-wide text-text-muted uppercase">
          Or start with an idea
        </p>
        {startIdeas.map(({ label, kind, idea, notes }) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              form.setValue('kind', kind);
              form.setValue('idea', idea);
              form.setValue('notes', notes);
            }}
            className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <span className="flex items-center gap-3">
              <KindIcon kind={kind} />
              {label}
            </span>
            <ChevronRight aria-hidden="true" size={16} className="text-text-muted" />
          </button>
        ))}
      </div>
    </section>
  );
}
