'use client';
import { Sparkles } from 'lucide-react';

import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

import { useReplyDraft } from '../api/reply-tools';

const tools = {
  rewrite: { label: 'AI rewrite', className: 'bg-primary-soft' },
  write: { label: 'Write with AI', className: 'bg-transparent' },
} as const;

type AiWritingToolProps = {
  mode: keyof typeof tools;
  conversationId: string;
  text: string;
  disabled: boolean;
  onWritten: (text: string) => void;
};

// AI rewrite polishes the typed reply; Write with AI answers the customer's latest messages. Both
// put the result in the reply box for the person to read before sending.
export function AiWritingTool({
  mode,
  conversationId,
  text,
  disabled,
  onWritten,
}: AiWritingToolProps) {
  const draft = useReplyDraft(conversationId);
  const { label, className } = tools[mode];
  return (
    <>
      <Button
        variant="secondary"
        type="button"
        size="sm"
        loading={draft.isPending}
        disabled={disabled || (mode === 'rewrite' && !text.trim())}
        className={cn('border-0 text-action-hover', className)}
        onClick={() =>
          draft.mutate(mode === 'rewrite' ? { mode, text } : { mode }, { onSuccess: onWritten })
        }
      >
        <Sparkles aria-hidden="true" size={16} />
        {label}
      </Button>
      {draft.error ? (
        <p role="alert" className="w-full text-sm text-danger">
          {draft.error.message}
        </p>
      ) : null}
    </>
  );
}
