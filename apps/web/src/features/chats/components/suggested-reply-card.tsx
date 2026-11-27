'use client';
import { Send, Sparkles } from 'lucide-react';
import { useState } from 'react';

import type { ConversationResponse } from '@dakly/contracts/chats';
import { Button } from '@dakly/ui/button';

import type { useSendReply } from '../api/conversation-thread';
import { handoverReasonLabels } from '../handover-reasons';

// Hidden once used here, before the chat is read again without it.
export function SuggestedReply({
  conversation,
  sendReply,
  onEdit,
}: {
  conversation: ConversationResponse;
  sendReply: ReturnType<typeof useSendReply>;
  onEdit: (body: string) => void;
}) {
  const [used, setUsed] = useState<string | null>(null);
  const suggestion = conversation.suggestedReply;
  if (!suggestion || suggestion === used) return null;
  return (
    <SuggestedReplyCard
      conversation={conversation}
      suggestion={suggestion}
      pending={sendReply.isPending}
      onSend={() => {
        setUsed(suggestion);
        sendReply.mutate(suggestion, { onError: () => setUsed(null) });
      }}
      onEdit={() => {
        setUsed(suggestion);
        onEdit(suggestion);
      }}
    />
  );
}

type SuggestedReplyCardProps = {
  conversation: ConversationResponse;
  suggestion: string;
  pending: boolean;
  onSend: () => void;
  onEdit: () => void;
};

// The AI's draft for the person it handed the chat to. Nothing goes to the customer until they
// press Send.
function SuggestedReplyCard({
  conversation,
  suggestion,
  pending,
  onSend,
  onEdit,
}: SuggestedReplyCardProps) {
  const label = conversation.handoverReason
    ? `${handoverReasonLabels[conversation.handoverReason]} · suggested reply`
    : 'Suggested reply';
  return (
    <section
      aria-label="Suggested reply"
      className="shrink-0 space-y-2 border-t border-border bg-primary-soft px-4 py-3"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-action-hover">
        <Sparkles aria-hidden="true" size={14} />
        {label}
      </p>
      <p className="text-sm whitespace-pre-wrap">{suggestion}</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={onSend}>
          <Send aria-hidden="true" size={16} />
          Send
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={onEdit}>
          Edit
        </Button>
      </div>
    </section>
  );
}
