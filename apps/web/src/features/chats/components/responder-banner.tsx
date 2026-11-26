'use client';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';

import type { ConversationResponse } from '@dakly/contracts/chats';
import { Button, buttonVariants } from '@dakly/ui/button';
import { useToast } from '@dakly/ui/toast';

import { useAgentSettings } from '../api/agent-settings';
import { useReturnToAi, useTakeOverConversation } from '../api/conversation-actions';
import { chatsHref, type ChatScreenQuery } from '../chat-filters';
import { InboxIcon } from './inbox-icon';
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
  const confirm = () =>
    action.mutate(undefined, {
      onSuccess: () =>
        showToast(
          ai
            ? "You're handling this chat. Dakly AI paused here."
            : 'Dakly AI is handling this chat again.',
        ),
    });
  return (
    <div
      className={
        ai
          ? 'flex min-h-11 shrink-0 items-center gap-2 border-b border-border bg-success-soft px-3.5 py-1.5'
          : 'flex min-h-11 shrink-0 items-center gap-2 border-b border-inbox-note-border bg-warning-soft px-3.5 py-1.5 text-warning'
      }
    >
      {ai ? <Sparkles aria-hidden="true" size={16} /> : <InboxIcon name="handoff" />}
      <p className="min-w-0 flex-1 text-sm font-medium">
        {ai ? 'Dakly AI is handling this chat' : 'Your team is handling this chat'}
      </p>
      {canEdit ? (
        <Button
          variant="secondary"
          className="min-h-10 border-border-strong px-2.5 py-1 text-sm md:min-h-8"
          loading={action.isPending}
          onClick={confirm}
        >
          {!ai && <InboxIcon name="back-ai" />}
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

function AutoReplyOffBanner({ query }: { query: ChatScreenQuery }) {
  const canChangeSettings = Boolean(useSessionContext().data?.currentStore?.canEditStoreSettings);
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-inbox-note-border bg-warning-soft px-3.5 py-1.5">
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
