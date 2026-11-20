'use client';
import { Send, Sparkles, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

import { askDaklyRequestSchema } from '@dakly/contracts/assistant';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

import { useAskDakly } from '../api/ask-dakly';
import { askSuggestions, MAX_SUGGESTIONS } from '../ask-suggestions';
import { useSessionContext } from '@/lib/session-context';

export type Turn =
  { role: 'user'; text: string } | { role: 'assistant'; text: string; sources: string[] };

type AskDaklyPanelProps = {
  turns: Turn[];
  onTurns: (turns: Turn[]) => void;
  onClose: () => void;
};

const pageNames: Record<string, string> = {
  dashboard: 'Dashboard',
  analytics: 'Analytics',
  orders: 'Orders',
  products: 'Products',
  customers: 'All customers',
  segments: 'Segments',
  campaigns: 'Campaigns',
  automations: 'Automations',
  chats: 'Chats',
  social: 'Social hub',
};
const MAX_HISTORY = 6;

export function AskDaklyPanel({ turns, onTurns, onClose }: AskDaklyPanelProps) {
  const titleId = useId();
  const pageName = pageNames[usePathname().split('/')[1] ?? ''];
  const [question, setQuestion] = useState('');
  const [creditsLeft, setCreditsLeft] = useState<number>();
  const ask = useAskDakly();

  function send(text: string) {
    const parsed = askDaklyRequestSchema.safeParse({
      question: text,
      history: turns.slice(-MAX_HISTORY).map(({ role, text: said }) => ({ role, text: said })),
    });
    if (!parsed.success || ask.isPending) return;
    const asked: Turn[] = [...turns, { role: 'user', text: parsed.data.question }];
    onTurns(asked);
    setQuestion('');
    ask.mutate(parsed.data, {
      onSuccess: (answer) => {
        if (answer.kind === 'answer') setCreditsLeft(answer.creditsLeft);
        const sources = answer.kind === 'answer' ? answer.sources : [];
        onTurns([...asked, { role: 'assistant', text: answer.text, sources }]);
      },
      // The typed question comes back, so a retry is one tap.
      onError: () => setQuestion(parsed.data.question),
    });
  }

  return (
    <aside
      aria-labelledby={titleId}
      onKeyDown={(event) => event.key === 'Escape' && onClose()}
      className="fixed inset-y-0 right-0 z-50 flex h-dvh w-full max-w-100 flex-col border-l border-border bg-surface text-text shadow-overlay"
    >
      <PanelHeader titleId={titleId} pageName={pageName} onClose={onClose} />
      <Conversation turns={turns} ask={ask} onPick={send} />
      <Composer
        question={question}
        onQuestion={setQuestion}
        onSend={() => send(question)}
        isPending={ask.isPending}
        creditsLeft={creditsLeft}
      />
    </aside>
  );
}

function PanelHeader({
  titleId,
  pageName,
  onClose,
}: {
  titleId: string;
  pageName?: string;
  onClose: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-on-primary"
      >
        <Sparkles size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="text-base font-semibold">
          Dakly AI
        </h2>
        <p className="truncate text-xs text-text-muted">
          {pageName ? `Knows you’re on ${pageName}` : 'Answers from your shop’s reports'}
        </p>
      </div>
      <Button variant="secondary" className="px-2" aria-label="Close" onClick={onClose}>
        <X aria-hidden="true" size={16} strokeWidth={1.75} />
      </Button>
    </header>
  );
}

function Conversation({
  turns,
  ask,
  onPick,
}: {
  turns: Turn[];
  ask: ReturnType<typeof useAskDakly>;
  onPick: (text: string) => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [turns, ask.isPending]);
  return (
    <div
      role="log"
      aria-label="Conversation"
      className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
    >
      {turns.length === 0 ? (
        <Suggestions onPick={onPick} disabled={ask.isPending} />
      ) : (
        turns.map((turn, index) => <TurnView key={index} turn={turn} />)
      )}
      {ask.isPending ? (
        <p role="status" className="text-sm text-text-muted">
          Reading your shop’s reports…
        </p>
      ) : null}
      {ask.error ? <AskError error={ask.error} /> : null}
      <div ref={end} />
    </div>
  );
}

type ComposerProps = {
  question: string;
  onQuestion: (text: string) => void;
  onSend: () => void;
  isPending: boolean;
  creditsLeft?: number;
};
function Composer({ question, onQuestion, onSend, isPending, creditsLeft }: ComposerProps) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    onSend();
  }
  return (
    <div className="shrink-0 border-t border-border px-4 py-3">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          ref={input}
          value={question}
          onChange={(event) => onQuestion(event.target.value)}
          maxLength={500}
          aria-label="Ask Dakly AI"
          placeholder="Ask in English or Bangla"
        />
        <Button
          type="submit"
          className="shrink-0 px-2"
          aria-label="Send"
          disabled={!question.trim() || isPending}
        >
          <Send aria-hidden="true" size={16} />
        </Button>
      </form>
      <p className="mt-2 text-xs text-text-muted">
        Dakly AI suggests. You approve before anything is sent.
      </p>
      {creditsLeft === undefined ? null : (
        <p className="text-xs text-text-muted">
          {creditsLeft} AI {creditsLeft === 1 ? 'credit' : 'credits'} left
        </p>
      )}
    </div>
  );
}

function Suggestions({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  const { data } = useSessionContext();
  const shown = askSuggestions
    .filter(({ canAsk }) => data?.currentStore?.[canAsk])
    .slice(0, MAX_SUGGESTIONS);
  if (!shown.length) return null;
  return (
    <section aria-label="Suggested for this page" className="space-y-2">
      <h3 className="text-sm text-text-muted">Suggested for this page</h3>
      {shown.map(({ text }) => (
        <button
          key={text}
          type="button"
          disabled={disabled}
          onClick={() => onPick(text)}
          className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-left text-base hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {text}
        </button>
      ))}
    </section>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  if (turn.role === 'user')
    return (
      <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-inverse px-3 py-2 text-base wrap-anywhere text-on-primary">
        {turn.text}
      </p>
    );
  return (
    <div className="space-y-1">
      <p className="text-base wrap-anywhere whitespace-pre-line">{turn.text}</p>
      {turn.sources.length ? (
        <p className="text-xs text-text-muted">From {turn.sources.join(', ')}</p>
      ) : null}
    </div>
  );
}

function AskError({ error }: { error: Error }) {
  const code = error instanceof ApiError ? error.code : undefined;
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
      {code === 'ASK_CREDITS_UNAVAILABLE'
        ? 'You have used all your Ask Dakly AI credits for this plan period.'
        : 'Dakly AI is busy. Try again in a minute.'}
    </p>
  );
}
