import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { KnowledgeItemResponse } from '@dakly/contracts/knowledge';
import { Button } from '@dakly/ui/button';

import { useDeleteKnowledgeItem } from '../api/knowledge-items';
import { KnowledgeAnswerForm } from './knowledge-answer-form';
import { KnowledgeItemStatus } from './knowledge-item-status';

type KnowledgeAnswerCardProps = { item: KnowledgeItemResponse; canEdit: boolean };

export function KnowledgeAnswerCard({ item, canEdit }: KnowledgeAnswerCardProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view');
  const remove = useDeleteKnowledgeItem();
  if (mode === 'edit')
    return (
      <KnowledgeAnswerForm id={item.id} answer={item.answer ?? ''} onDone={() => setMode('view')} />
    );
  return (
    <li className="space-y-2 rounded-lg border border-border p-3">
      <p className="whitespace-pre-wrap">{item.answer}</p>
      <div className="flex flex-wrap items-center gap-2">
        <KnowledgeItemStatus item={item} />
        {canEdit && mode === 'view' ? (
          <span className="ml-auto flex gap-1">
            <Button variant="secondary" aria-label="Edit answer" onClick={() => setMode('edit')}>
              <Pencil aria-hidden="true" size={16} strokeWidth={1.75} />
            </Button>
            <Button
              variant="secondary"
              aria-label="Delete answer"
              onClick={() => setMode('confirm')}
            >
              <Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />
            </Button>
          </span>
        ) : null}
      </div>
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
