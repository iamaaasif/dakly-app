import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { KnowledgeItemResponse } from '@dakly/contracts/knowledge';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';

import { useDeleteKnowledgeItem } from '../api/knowledge-items';
import { KnowledgeAnswerForm } from './knowledge-answer-form';
import { KnowledgeItemStatus } from './knowledge-item-status';

type KnowledgeAnswerCardProps = { item: KnowledgeItemResponse; canEdit: boolean };

// Quiet icon buttons, as the design draws them, still 32 px square to tap.
const iconButton = 'min-h-8 min-w-8 border-0 bg-transparent p-0 text-text-muted';

function timesUsedText(count: number) {
  if (count === 0) return 'Not used yet';
  return `Used ${count} ${count === 1 ? 'time' : 'times'}`;
}

type AnswerActionsProps = { onEdit: () => void; onDelete: () => void };

function AnswerActions({ onEdit, onDelete }: AnswerActionsProps) {
  return (
    <span className="flex gap-1">
      <Button variant="secondary" className={iconButton} aria-label="Edit answer" onClick={onEdit}>
        <Pencil aria-hidden="true" size={16} strokeWidth={1.75} />
      </Button>
      <Button
        variant="secondary"
        className={iconButton}
        aria-label="Delete answer"
        onClick={onDelete}
      >
        <Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />
      </Button>
    </span>
  );
}

type AnswerDetailsProps = { item: KnowledgeItemResponse };

function AnswerDetails({ item }: AnswerDetailsProps) {
  return (
    <>
      {item.question ? (
        <p className="rounded-md bg-primary-soft p-3 whitespace-pre-wrap">{item.answer}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {item.keywords.slice(0, 4).map((word) => (
          <Badge key={word}>{word}</Badge>
        ))}
        <span className="ml-auto text-sm text-text-muted">
          Added by you · {timesUsedText(item.timesUsed)}
        </span>
      </div>
      {item.status === 'active' ? null : <KnowledgeItemStatus item={item} />}
    </>
  );
}

export function KnowledgeAnswerCard({ item, canEdit }: KnowledgeAnswerCardProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view');
  const remove = useDeleteKnowledgeItem();
  return (
    <li className="space-y-2 rounded-lg border border-border p-3">
      {mode === 'edit' ? (
        <KnowledgeAnswerForm
          id={item.id}
          question={item.question ?? ''}
          answer={item.answer ?? ''}
          keywords={item.keywords}
          onDone={() => setMode('view')}
        />
      ) : null}
      <div className="flex items-start gap-2">
        <p className="flex-1 font-semibold">{item.question ?? item.answer}</p>
        {canEdit && mode !== 'confirm' ? (
          <AnswerActions onEdit={() => setMode('edit')} onDelete={() => setMode('confirm')} />
        ) : null}
      </div>
      <AnswerDetails item={item} />
      {mode === 'confirm' ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <span>Dakly will stop using this answer.</span>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => remove.mutate(item.id)}
          >
            Delete answer
          </Button>
          <Button variant="secondary" onClick={() => setMode('view')}>
            Keep it
          </Button>
        </div>
      ) : null}
      {remove.isError ? (
        <p role="alert" className="text-sm text-danger">
          {remove.error.message}
        </p>
      ) : null}
    </li>
  );
}
