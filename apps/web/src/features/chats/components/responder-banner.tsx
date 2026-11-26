'use client';
import { Bot, Sparkles, UserRound } from 'lucide-react';
import Link from 'next/link';

import type { ConversationResponse } from '@dakly/contracts/chats';
import { Button, buttonVariants } from '@dakly/ui/button';
import { useToast } from '@dakly/ui/toast';

import { useAgentSettings } from '../api/agent-settings';
import { useReturnToAi, useTakeOverConversation } from '../api/conversation-actions';
import { chatsHref, type ChatScreenQuery } from '../chat-filters';
import { useSessionContext } from '@/lib/session-context';

// Only the AI and a person who took over are shown; a paused chat has no one to hand to.
export function ResponderBanner({
  conversation,
  canEdit,
  query,
}: {
  conversation: ConversationResponse;
  canEdit: boolean;
  query: ChatScreenQuery;
}) {
  const settings = useAgentSettings();
  if (conversation.responder === 'paused') return null;
  // The chat is assigned to the AI, but with the store switch off nothing will answer it.
  if (conversation.responder === 'ai' && settings.data && !settings.data.isAutoReplyOn)
    return <AutoReplyOffBanner query={query} />;
  return <HandlingBanner conversation={conversation} canEdit={canEdit} />;
}

const aiLook = {
  icon: Sparkles,
  title: 'Dakly AI is handling this chat',
  border: 'border-border',
  bar: 'bg-success-soft',
  button: 'Take over',
  buttonIcon: null,
  toast: "You're handling this chat. Dakly AI paused here.",
};

const teamLook = {
  icon: UserRound,
  title: 'Your team is handling this chat',
  border: 'border-warning',
  bar: 'bg-warning-soft text-warning',
  button: 'Hand back to Dakly AI',
  buttonIcon: <Bot aria-hidden="true" size={16} strokeWidth={1.75} />,
  toast: 'Dakly AI is handling this chat again.',
};

function HandlingBanner({
  conversation,
  canEdit,
}: {
  conversation: ConversationResponse;
  canEdit: boolean;
}) {
  const showToast = useToast();
  const takeOver = useTakeOverConversation(conversation.id);
  const returnToAi = useReturnToAi(conversation.id);
  const ai = conversation.responder === 'ai';
  const action = ai ? takeOver : returnToAi;
  const look = ai ? aiLook : teamLook;
  const Icon = look.icon;
  return (
    <div className={`shrink-0 border-b ${look.border}`}>
      <div className={`flex items-center gap-2 px-3 py-2 ${look.bar}`}>
        <Icon aria-hidden="true" size={16} strokeWidth={1.75} />
        <p className="min-w-0 flex-1 font-medium">{look.title}</p>
        {canEdit ? (
          <Button
            variant="secondary"
            loading={action.isPending}
            onClick={() => action.mutate(undefined, { onSuccess: () => showToast(look.toast) })}
          >
            {look.buttonIcon}
            {look.button}
          </Button>
        ) : null}
        {action.error ? (
          <p role="alert" className="basis-full text-danger">
            {action.error.message}
          </p>
        ) : null}
      </div>
      {ai ? null : <HandoverSummary summary={conversation.handoverSummary} />}
    </div>
  );
}

function HandoverSummary({ summary }: { summary: string | null }) {
  if (!summary) return null;
  return (
    <p className="border-t border-border bg-surface-muted px-3 py-2 text-xs text-text-muted">
      <span className="font-medium text-text">Handover summary: </span>
      {summary}
    </p>
  );
}

function AutoReplyOffBanner({ query }: { query: ChatScreenQuery }) {
  const canChangeSettings = Boolean(useSessionContext().data?.currentStore?.canEditStoreSettings);
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-warning-soft px-3 py-2">
      <Sparkles aria-hidden="true" size={16} strokeWidth={1.75} />
      <p className="min-w-48 flex-1 font-medium">
        AI auto-reply is off, so Dakly AI will not answer this chat.
      </p>
      {canChangeSettings ? (
        <Link
          href={chatsHref({ ...query, agent: 'settings' })}
          className={buttonVariants({ variant: 'secondary' })}
        >
          Turn on AI auto-reply
        </Link>
      ) : null}
    </div>
  );
}
