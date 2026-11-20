import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { askTestSchema, type TestAnswerResponse } from '@dakly/contracts/ai-practice';
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

function Result({ answer }: { answer: TestAnswerResponse }) {
  if (answer.kind === 'reply')
    return (
      <section aria-label="Dakly replies" className="space-y-1 rounded-lg border border-border p-3">
        <p className="text-sm text-text-muted">Dakly would reply</p>
        <p className="whitespace-pre-wrap">{answer.text}</p>
      </section>
    );
  return (
    <section
      aria-label="Dakly hands over"
      className="space-y-1 rounded-lg border border-border p-3"
    >
      <p className="text-sm text-text-muted">Dakly would call your team</p>
      <p>{handoverText[answer.reason]}</p>
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
        Type a message as a customer would. See what Dakly replies. Nothing is sent.
      </p>
      <form onSubmit={submit} aria-label="Test the agent" className="flex gap-3">
        <Input
          aria-label="Customer message"
          placeholder="e.g. Showroom kothay?"
          {...form.register('question')}
        />
        <Button type="submit" loading={ask.isPending}>
          Test
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {examples.map((example) => (
          <Button
            key={example}
            variant="secondary"
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
      {ask.data && !ask.isPending ? <Result answer={ask.data} /> : null}
    </div>
  );
}
