'use client';
import { Sparkles } from 'lucide-react';
import { type FormEvent, useState } from 'react';

import { askDaklyRequestSchema } from '@dakly/contracts/assistant';

import { handOffQuestion } from '../ask-handoff';
import { askSuggestions } from '../ask-suggestions';
import { useAskPanel } from '../hooks/use-ask-panel';
import { useSessionContext } from '@/lib/session-context';

const TRY_COUNT = 3;

// Asking here opens the Ask Dakly AI panel with the question already sent.
export function DashboardAskBox() {
  const { data } = useSessionContext();
  const [, setOpen] = useAskPanel();
  const [question, setQuestion] = useState('');
  const tries = askSuggestions
    .filter(({ canAsk }) => data?.currentStore?.[canAsk])
    .slice(0, TRY_COUNT);

  function ask(text: string) {
    const parsed = askDaklyRequestSchema.shape.question.safeParse(text);
    if (!parsed.success) return;
    handOffQuestion(parsed.data);
    setQuestion('');
    setOpen(true);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    ask(question);
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={submit}
        className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus"
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-md bg-primary-soft text-action-hover"
        >
          <Sparkles size={16} />
        </span>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={500}
          aria-label="Ask Dakly AI"
          placeholder="Ask Dakly anything, in Bangla or English…"
          className="min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-text-muted"
        />
      </form>
      {tries.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-muted">Try:</span>
          {tries.map(({ text }) => (
            <button
              key={text}
              type="button"
              onClick={() => ask(text)}
              className="inline-flex min-h-8 items-center rounded-full border border-border bg-surface px-3 text-sm hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
