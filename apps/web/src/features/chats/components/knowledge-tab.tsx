import { FileText, MessageSquare, Package, Plus, Store, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

import type { KnowledgeItemResponse } from '@dakly/contracts/knowledge';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useKnowledgeItems, useKnowledgeSummary } from '../api/knowledge-items';
import { KnowledgeAnswerCard } from './knowledge-answer-card';
import { KnowledgeAnswerForm } from './knowledge-answer-form';
import { KnowledgeFiles } from './knowledge-files';
import { pluralize } from '@/lib/pluralize';

// Files and website links are sources Dakly reads; every other item is an answer the owner wrote.
const isSource = (item: KnowledgeItemResponse) => item.kind === 'file' || item.kind === 'url';

type SummaryCardProps = { icon: LucideIcon; title: string; count: string; hint: string };

function SummaryCard({ icon: Icon, title, count, hint }: SummaryCardProps) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="flex items-center gap-2 text-sm text-text-muted">
        <Icon aria-hidden="true" size={16} strokeWidth={1.75} />
        {title}
      </p>
      <p className="text-lg font-semibold">{count}</p>
      <p className="text-sm text-text-muted">{hint}</p>
    </div>
  );
}

export function KnowledgeTab({ canEdit }: { canEdit: boolean }) {
  const items = useKnowledgeItems();
  const summary = useKnowledgeSummary();
  if (items.isPending) return <Skeleton className="h-96 w-full" />;
  if (items.isError)
    return <QueryError message={items.error.message} onRetry={() => void items.refetch()} />;
  const usable = items.data.items.filter((item) => item.status !== 'archived');
  const files = usable.filter(isSource);
  const answers = usable.filter((item) => !isSource(item));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard
          icon={Package}
          title="Products"
          count={summary.data ? pluralize(summary.data.productsCount, 'product') : '—'}
          hint="Prices, sizes and stock, synced"
        />
        <SummaryCard
          icon={Store}
          title="Store rules"
          count={summary.data ? pluralize(summary.data.storeRulesCount, 'rule') : '—'}
          hint="Delivery charges and your extra rules"
        />
        <SummaryCard
          icon={MessageSquare}
          title="Your answers"
          count={pluralize(answers.length, 'answer')}
          hint="Questions you taught Dakly"
        />
        <SummaryCard
          icon={FileText}
          title="Files and links"
          count={pluralize(files.length, 'source')}
          hint="Policies, size charts, your website"
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
  const shown = answers.filter((item) =>
    [item.question, item.answer, ...item.keywords].join(' ').toLowerCase().includes(needle),
  );
  return (
    <section aria-labelledby="your-answers" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="your-answers" className="text-sm font-semibold text-text-muted uppercase">
          Your answers
        </h3>
        {canEdit && !adding ? (
          <Button className="bg-inverse hover:bg-inverse/90" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" size={16} strokeWidth={1.75} />
            Add answer
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-text-muted">
        When a customer’s message has one of the words, Dakly replies with your answer — word for
        word.
      </p>
      {adding ? (
        <KnowledgeAnswerForm
          id={null}
          question=""
          answer=""
          keywords={[]}
          onDone={() => setAdding(false)}
        />
      ) : null}
      <Input
        type="search"
        aria-label="Search answers"
        placeholder="Search answers"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {answers.length === 0 ? (
        <p className="text-text-muted">No answers yet. Add the questions customers ask you most.</p>
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
