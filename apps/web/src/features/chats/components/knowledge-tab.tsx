import { Plus } from 'lucide-react';
import { useState } from 'react';

import type { KnowledgeItemResponse } from '@dakly/contracts/knowledge';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useKnowledgeItems } from '../api/knowledge-items';
import { KnowledgeAnswerCard } from './knowledge-answer-card';
import { KnowledgeAnswerForm } from './knowledge-answer-form';
import { KnowledgeFiles } from './knowledge-files';

// Answers the owner wrote and facts read from a file are both "taught" items; files are listed apart.
const isFile = (item: KnowledgeItemResponse) => item.kind === 'file';

function SummaryCard({ title, count, hint }: { title: string; count: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-sm text-text-muted">{title}</p>
      <p className="text-lg font-semibold">{count}</p>
      <p className="text-sm text-text-muted">{hint}</p>
    </div>
  );
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function KnowledgeTab({ canEdit }: { canEdit: boolean }) {
  const items = useKnowledgeItems();
  if (items.isPending) return <Skeleton className="h-96 w-full" />;
  if (items.isError)
    return <QueryError message={items.error.message} onRetry={() => void items.refetch()} />;
  const usable = items.data.items.filter((item) => item.status !== 'archived');
  const files = usable.filter(isFile);
  const answers = usable.filter((item) => !isFile(item));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard
          title="Your answers"
          count={plural(answers.length, 'answer')}
          hint="Questions you taught Dakly"
        />
        <SummaryCard
          title="Files"
          count={plural(files.length, 'file')}
          hint="Policies, size charts, price lists"
        />
      </div>
      <AnswersSection answers={answers} canEdit={canEdit} />
      <KnowledgeFiles files={files} canEdit={canEdit} />
    </div>
  );
}

type AnswersSectionProps = { answers: KnowledgeItemResponse[]; canEdit: boolean };

function AnswersSection({ answers, canEdit }: AnswersSectionProps) {
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const shown = answers.filter((item) => (item.answer ?? '').toLowerCase().includes(needle));
  return (
    <section aria-labelledby="your-answers" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="your-answers" className="text-sm font-semibold text-text-muted uppercase">
          Your answers
        </h3>
        {canEdit && !adding ? (
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" size={16} strokeWidth={1.75} />
            Add answer
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-text-muted">
        Dakly looks up these answers when a customer asks about them, and replies in your words.
      </p>
      {adding ? <KnowledgeAnswerForm id={null} answer="" onDone={() => setAdding(false)} /> : null}
      <Input
        type="search"
        aria-label="Search answers"
        placeholder="Search answers"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {answers.length === 0 ? (
        <p className="text-text-muted">No answers yet. Add the ones customers ask most.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((item) => (
            <KnowledgeAnswerCard key={item.id} item={item} canEdit={canEdit} />
          ))}
        </ul>
      )}
      {answers.length > 0 && shown.length === 0 ? (
        <p className="text-text-muted">No answer has those words.</p>
      ) : null}
    </section>
  );
}
