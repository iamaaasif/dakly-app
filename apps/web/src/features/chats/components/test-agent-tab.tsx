import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import {
  askTestSchema,
  type TestAnswerResponse,
  type TestAnswerSource,
} from '@dakly/contracts/ai-practice';
import type { handoverReasons } from '@dakly/contracts/chats';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

import { useAskTestQuestion } from '../api/test-agent';

const examples = [
  'Showroom kothay?',
  'Kurti M size koto?',
  'Rangamati te COD hobe?',
  'Kapor ki cotton?',
];

const handoverText: Record<(typeof handoverReasons)[number], string> = {
  asked_for_person: 'The customer asked for a person.',
  complaint: 'This sounds like a complaint.',
  refund: 'This is about a refund or exchange.',
  discount: 'The customer is asking for a discount.',
  angry: 'The customer sounds upset.',
  out_of_scope: 'Dakly does not have an answer for this in Knowledge.',
  ready_to_buy: 'The customer is ready to buy.',
  ai_unavailable: 'The AI could not answer right now. Try again in a minute.',
  allowance_used: 'This month’s AI replies are used up.',
  other: 'Your hand-over rules send this to a person.',
};

const unknownLine = 'Dakly doesn’t know this yet, so it calls your team.';

function sourceLine(source: TestAnswerSource): string {
  if (source.kind === 'answer')
    return source.question
      ? `Answered from your answer: “${source.question}”`
      : 'Answered from your answer';
  if (source.kind === 'file')
    return source.fileName ? `Answered from ${source.fileName}` : 'Answered from a file';
  if (source.kind === 'products') return 'Answered from Products and stock';
  if (source.kind === 'store_rules') return 'Answered from Store rules';
  return 'General reply';
}

// What the design shows under a hand-over: the missing answer in red, a rule in green, and
// nothing when the AI itself was not available.
function handoverLine(reason: keyof typeof handoverText) {
  if (reason === 'out_of_scope') return { text: unknownLine, isProblem: true };
  if (reason === 'ai_unavailable' || reason === 'allowance_used') return null;
  return { text: 'Hand-off rule', isProblem: false };
}

function Result({ question, answer }: { question: string; answer: TestAnswerResponse }) {
  const line =
    answer.kind === 'reply'
      ? { text: sourceLine(answer.source), isProblem: false }
      : handoverLine(answer.reason);
  return (
    <section
      aria-label="Test result"
      className="flex flex-col gap-2 rounded-lg bg-surface-muted p-3"
    >
      <p className="max-w-[85%] self-start rounded-lg border border-border bg-surface px-3 py-2">
        {question}
      </p>
      <p className="max-w-[85%] self-end rounded-lg bg-action px-3 py-2 whitespace-pre-wrap text-on-primary">
        {answer.kind === 'reply'
          ? answer.text
          : `(Dakly stops and calls your team: ${handoverText[answer.reason]})`}
      </p>
      {line ? (
        <p
          className={`self-end text-right text-sm font-semibold ${line.isProblem ? 'text-danger' : 'text-success'}`}
        >
          {line.text}
        </p>
      ) : null}
    </section>
  );
}

export function TestAgentTab({ canEdit }: { canEdit: boolean }) {
  const form = useForm({ resolver: zodResolver(askTestSchema), defaultValues: { question: '' } });
  const ask = useAskTestQuestion();
  const submit = form.handleSubmit((values) => ask.mutate(values));
  if (!canEdit)
    return <p className="text-text-muted">Only owners and admins can test the agent.</p>;
  return (
    <div className="space-y-4">
      <p className="text-text-muted">
        Type a message as a customer would. See exactly what Dakly replies, and where the answer
        came from. Nothing is sent.
      </p>
      <form onSubmit={submit} aria-label="Test the agent" className="flex gap-3">
        <Input
          aria-label="Customer message"
          placeholder="e.g. Showroom kothay?"
          {...form.register('question')}
        />
        <Button type="submit" className="bg-inverse hover:bg-inverse/90" loading={ask.isPending}>
          Test
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {examples.map((example) => (
          <Button
            key={example}
            variant="secondary"
            className="min-h-8 rounded-full px-3 py-1 text-sm"
            onClick={() => {
              form.setValue('question', example);
              ask.mutate({ question: example });
            }}
          >
            {example}
          </Button>
        ))}
      </div>
      {ask.isPending ? <p role="status">Dakly is working on a reply…</p> : null}
      {ask.isError ? (
        <p role="alert" className="text-danger">
          {ask.error.message}
        </p>
      ) : null}
      {ask.data && !ask.isPending ? (
        <Result question={ask.variables.question} answer={ask.data} />
      ) : null}
    </div>
  );
}
