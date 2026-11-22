'use client';
import { Sparkles, UserRound } from 'lucide-react';

import type { ConversationResponse } from '@dakly/contracts/chats';
import { Button } from '@dakly/ui/button';
import { useToast } from '@dakly/ui/toast';

import { useReturnToAi, useTakeOverConversation } from '../api/conversation-actions';

// Only the AI and a person who took over are shown; a paused chat has no one to hand to.
export function ResponderBanner({
  conversation,
  canEdit,
}: {
  conversation: ConversationResponse;
  canEdit: boolean;
}) {
  const showToast = useToast();
  const takeOver = useTakeOverConversation(conversation.id);
  const returnToAi = useReturnToAi(conversation.id);
  if (conversation.responder === 'paused') return null;
  const ai = conversation.responder === 'ai';
  const action = ai ? takeOver : returnToAi;
  const confirm = () =>
    action.mutate(undefined, {
      onSuccess: () =>
        showToast(
          ai
            ? "You're handling this chat. Dakly AI paused here."
            : 'Dakly AI is handling this chat again.',
        ),
    });
  const Icon = ai ? Sparkles : UserRound;
  return (
    <div
      className={
        ai
          ? 'flex shrink-0 items-center gap-2 border-b border-border bg-success-soft px-3 py-2'
          : 'flex shrink-0 items-center gap-2 border-b border-border bg-surface-muted px-3 py-2'
      }
    >
      <Icon aria-hidden="true" size={16} strokeWidth={1.75} />
      <p className="min-w-0 flex-1 font-medium">
        {ai ? 'Dakly AI is handling this chat' : 'Your team is handling this chat'}
      </p>
      {canEdit ? (
        <Button variant="secondary" loading={action.isPending} onClick={confirm}>
          {ai ? 'Take over' : 'Hand back to Dakly AI'}
        </Button>
      ) : null}
      {action.error ? (
        <p role="alert" className="basis-full text-danger">
          {action.error.message}
        </p>
      ) : null}
    </div>
  );
}
