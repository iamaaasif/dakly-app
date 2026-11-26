'use client';
import { MessageSquare, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useId, useRef, useState } from 'react';

import { Button, buttonVariants } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

import { chatScreenQuerySchema, chatsHref, type ChatScreenQuery } from '../chat-filters';
import { AiAgentDrawer } from './ai-agent-drawer';
import { ChatChannelFilter } from './chat-channel-filter';
import { ChatHeaderPills } from './chat-header-pills';
import { ChatList } from './chat-list';
import { ChatToolbar } from './chat-search-bar';
import { ChatTabs } from './chat-tabs';
import { CommentsView } from './comments-view';
import { ConversationPanel } from './conversation-panel';
import { InboxIcon } from './inbox-icon';
import { useUrlQuery } from '@/lib/use-url-query';

export function ChatsScreen({ query: initial }: { query: ChatScreenQuery }) {
  const query = useUrlQuery(initial, (raw) => chatScreenQuerySchema.safeParse(raw).data);
  const router = useRouter();
  const withoutAgent = { ...query, agent: undefined, feedback: undefined };
  const openOnMobile = Boolean(query.chat || query.post);
  const folders = useInboxFolders();
  return (
    <main className="inbox-theme flex min-h-0 flex-1 flex-col bg-surface text-text min-[1440px]:flex-row">
      <InboxFolders query={query} openOnMobile={openOnMobile} folders={folders} />
      <div
        data-chat={query.chat && query.channel !== 'comments' ? 'open' : undefined}
        className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(14rem,min(26vw,var(--spacing-inbox-chat-list)))_minmax(0,1fr)] xl:data-[chat=open]:grid-cols-[minmax(14rem,min(17.5vw,var(--spacing-inbox-chat-list)))_minmax(0,1fr)_minmax(0,min(20vw,var(--spacing-inbox-customer)))]"
      >
        <div
          role="group"
          aria-label="Inbox controls"
          className={cn(
            'col-start-1 row-start-1 flex min-h-inbox-toolbar min-w-0 flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5 lg:col-span-2',
            openOnMobile && 'hidden lg:flex',
          )}
        >
          {!folders.expanded && <InboxHeading folders={folders} />}
          <ChatToolbar query={query} channel={<ChatChannelFilter query={query} />} />
          {!folders.expanded && <InboxAgentLink query={query} />}
        </div>
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
                className="col-start-2 row-start-2 hidden flex-col items-center justify-center gap-2 border-l border-border bg-inbox-thread p-6 text-center text-text-muted lg:flex"
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

function useInboxFolders() {
  const [expanded, setExpanded] = useState(true);
  const id = useId();
  const restoreFocus = useRef(false);
  const attachToggle = useCallback((button: HTMLButtonElement | null) => {
    if (!button || !restoreFocus.current) return;
    restoreFocus.current = false;
    button.focus();
  }, []);

  function toggle() {
    restoreFocus.current = true;
    setExpanded((current) => !current);
  }

  return { expanded, id, attachToggle, toggle };
}

type InboxFoldersState = ReturnType<typeof useInboxFolders>;

function InboxFolders({
  query,
  openOnMobile,
  folders,
}: {
  query: ChatScreenQuery;
  openOnMobile: boolean;
  folders: InboxFoldersState;
}) {
  if (!folders.expanded) return <div id={folders.id} hidden />;

  return (
    <aside
      className={cn(
        'shrink-0 border-b border-border bg-inbox-thread min-[1440px]:flex min-[1440px]:w-[min(13vw,var(--spacing-inbox-folders))] min-[1440px]:flex-col min-[1440px]:overflow-y-auto min-[1440px]:border-r min-[1440px]:border-b-0',
        openOnMobile && 'hidden lg:block',
      )}
    >
      <div className="flex min-h-inbox-toolbar items-center gap-3 border-b border-border px-3.5">
        <InboxHeading folders={folders} />
        <InboxAgentLink query={query} />
      </div>
      <div id={folders.id}>
        <ChatTabs query={query} />
        <div className="hidden border-t border-border p-2.5 lg:block">
          <ChatHeaderPills />
        </div>
      </div>
    </aside>
  );
}

function InboxHeading({ folders }: { folders: InboxFoldersState }) {
  const label = folders.expanded ? 'Collapse inbox folders' : 'Expand inbox folders';
  return (
    <div className="mr-2 flex shrink-0 items-center gap-3">
      <Button
        ref={folders.attachToggle}
        variant="secondary"
        aria-label={label}
        title={label}
        aria-controls={folders.id}
        aria-expanded={folders.expanded}
        onClick={folders.toggle}
        className="size-10 min-h-0 min-w-0 rounded-control border-border p-0 md:size-8"
      >
        <InboxIcon name="folders" />
      </Button>
      <h1 className="text-lg font-semibold tracking-tight">Inbox</h1>
    </div>
  );
}

function InboxAgentLink({ query }: { query: ChatScreenQuery }) {
  return (
    <Link
      href={chatsHref({ ...query, agent: 'settings' })}
      className={cn(
        buttonVariants({ variant: 'secondary' }),
        'ml-auto min-h-10 border-border-strong px-2.5 py-1 text-sm md:min-h-inbox-control',
      )}
    >
      <Sparkles aria-hidden="true" size={16} strokeWidth={1.75} />
      <span className="min-[1440px]:sr-only">AI agent</span>
    </Link>
  );
}
