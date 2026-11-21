import { ThumbsDown, ThumbsUp } from 'lucide-react';

import type { AiFeedbackItem } from '@dakly/contracts/ai-feedback';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';

import { feedbackReasonLabels } from './feedback-reasons';
import { formatShortDate } from '@/lib/format-date';

type FeedbackItemCardProps = { item: AiFeedbackItem; onFix?: (item: AiFeedbackItem) => void };

function CardHeader({ item }: { item: AiFeedbackItem }) {
  const isBad = item.rating === 'bad';
  const Thumb = isBad ? ThumbsDown : ThumbsUp;
  return (
    <div className="flex items-center gap-2">
      <Thumb
        aria-label={isBad ? 'Bad answer' : 'Good answer'}
        size={16}
        strokeWidth={1.75}
        className={isBad ? 'text-danger' : 'text-success'}
      />
      <span className="font-medium">{item.customerName ?? 'Customer'}</span>
      <time dateTime={item.ratedAt} className="ml-auto text-sm text-text-muted">
        {formatShortDate(item.ratedAt)}
      </time>
      {item.fixedAt ? <Badge variant="info">Learned</Badge> : null}
    </div>
  );
}

export function FeedbackItemCard({ item, onFix }: FeedbackItemCardProps) {
  const canFix = item.rating === 'bad' && !item.fixedAt && onFix;
  return (
    <li className="space-y-2 rounded-lg border border-border p-3">
      <CardHeader item={item} />
      {item.customerQuestion ? <p className="text-text-muted">“{item.customerQuestion}”</p> : null}
      <p className="rounded-md bg-primary-soft p-2 whitespace-pre-wrap">{item.replyText}</p>
      {item.reason ? (
        <p className="text-sm text-danger">{feedbackReasonLabels[item.reason]}</p>
      ) : null}
      {canFix ? <Button onClick={() => onFix(item)}>Write the right answer</Button> : null}
    </li>
  );
}
