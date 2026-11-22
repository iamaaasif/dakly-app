'use client';
import { MessageSquare, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { buttonVariants } from '@dakly/ui/button';

import { chatsHref, type ChatScreenQuery } from '../chat-filters';
import { AiAgentDrawer } from './ai-agent-drawer';
import { ChatList } from './chat-list';
import { CommentsView } from './comments-view';
import { ConversationPanel } from './conversation-panel';

export function ChatsScreen({ query }: { query: ChatScreenQuery }) {
  const router = useRouter();
  const withoutAgent = { ...query, agent: undefined, feedback: undefined };
  return (
    <main className="flex h-[calc(100dvh-9.25rem)] min-h-[32rem] flex-col gap-4 p-4 md:h-[calc(100dvh-4.25rem)] md:p-8">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Chats</h1>
          <p className="text-base text-text-muted">
            Messenger, WhatsApp, Instagram and post comments in one place. Turn each chat into an
            order.
          </p>
        </div>
        <Link
          href={chatsHref({ ...query, agent: 'settings' })}
          className={buttonVariants({ variant: 'secondary' })}
        >
          <Sparkles aria-hidden="true" size={16} strokeWidth={1.75} />
          AI agent
        </Link>
      </header>
      <div
        data-chat={query.chat ? 'open' : undefined}
        className="grid min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:data-[chat=open]:grid-cols-[minmax(0,24rem)_minmax(0,1fr)_minmax(0,22rem)]"
      >
        {query.channel === 'comments' ? (
          <CommentsView query={query} />
        ) : (
          <>
            <ChatList query={query} />
            {query.chat ? (
              <ConversationPanel key={query.chat} query={query} id={query.chat} />
            ) : (
              <section
                aria-label="Conversation"
                className="hidden flex-col items-center justify-center gap-2 border-l border-border p-6 text-center text-text-muted lg:flex"
              >
                <MessageSquare aria-hidden="true" size={28} strokeWidth={1.5} />
                <p>Choose a chat to read it.</p>
              </section>
            )}
          </>
        )}
      </div>
      <AiAgentDrawer
        tab={query.agent}
        feedbackFilter={query.feedback}
        onTabChange={(agent) => router.push(chatsHref({ ...query, agent }))}
        onFeedbackFilterChange={(feedback) => router.replace(chatsHref({ ...query, feedback }))}
        onClose={() => router.push(chatsHref(withoutAgent))}
      />
    </main>
  );
}
