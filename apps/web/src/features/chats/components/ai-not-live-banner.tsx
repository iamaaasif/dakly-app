'use client';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';

import type { AgentUsageResponse } from '@dakly/contracts/ai-agent-settings';
import { Button, buttonVariants } from '@dakly/ui/button';
import { useToast } from '@dakly/ui/toast';

import { formValues } from '../agent-settings-values';
import { useAiBlockers, type AiBlocker } from '../ai-blockers';
import { useAgentSettings, useAgentUsage, useSaveAgentSettings } from '../api/agent-settings';
import { chatsHref, type ChatScreenQuery } from '../chat-filters';
import { useSessionContext } from '@/lib/session-context';

function limitMessage(usage: AgentUsageResponse | undefined) {
  if (usage?.allowance === 0)
    return 'Your plan has no AI conversations, so Dakly AI cannot answer customers. Change your plan to turn replies on.';
  return 'You used all the AI conversations in your plan for this period, so Dakly AI cannot answer new chats until it renews. Change your plan or add AI conversations to keep replying.';
}

const practiceMessage =
  'Your channel is in practice mode. Dakly AI answers only your test questions until you go live.';
const autoReplyMessage =
  'The AI auto-reply switch is off, so no customer gets an answer from Dakly AI.';

export function AiNotLiveBanner({ query }: { query: ChatScreenQuery }) {
  const blockers = useAiBlockers();
  const usage = useAgentUsage();
  const canChangeSettings = Boolean(useSessionContext().data?.currentStore?.canEditStoreSettings);
  if (blockers.length === 0) return null;
  const messages: Record<AiBlocker, string> = {
    plan_limit: limitMessage(usage.data),
    auto_reply_off: autoReplyMessage,
    practice_mode: practiceMessage,
  };
  return (
    <div
      role="status"
      aria-label="AI is not live yet"
      className="shrink-0 space-y-2 border-b border-border bg-warning-soft px-3.5 py-2.5 text-sm"
    >
      <p className="flex items-center gap-2 font-semibold">
        <Sparkles aria-hidden="true" size={16} strokeWidth={1.75} />
        AI is not live yet
      </p>
      <ul className="space-y-2">
        {blockers.map((blocker) => (
          <li key={blocker} className="space-y-1.5">
            <p>{messages[blocker]}</p>
            {canChangeSettings ? <Fix blocker={blocker} query={query} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Fix({ blocker, query }: { blocker: AiBlocker; query: ChatScreenQuery }) {
  if (blocker === 'plan_limit') return null;
  if (blocker === 'auto_reply_off') return <TurnOnAutoReply />;
  return (
    <Link
      href={chatsHref({ ...query, agent: 'settings' })}
      className={buttonVariants({ variant: 'secondary', size: 'sm' })}
    >
      Go live
    </Link>
  );
}

// Saves the stored settings with only the switch changed, so nothing else the shop set is touched.
function TurnOnAutoReply() {
  const settings = useAgentSettings();
  const save = useSaveAgentSettings();
  const showToast = useToast();
  if (!settings.data) return null;
  const values = formValues(settings.data);
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        loading={save.isPending}
        onClick={() =>
          save.mutate(
            { ...values, isAutoReplyOn: true },
            { onSuccess: () => showToast('AI auto-reply is on.') },
          )
        }
      >
        Turn on AI auto-reply
      </Button>
      {save.error ? (
        <p role="alert" className="text-danger">
          {save.error.message}
        </p>
      ) : null}
    </>
  );
}
