'use client';
import { MessageSquare, PanelLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useId, useRef, useState, useSyncExternalStore } from 'react';

import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

import { chatScreenQuerySchema, chatsHref, type ChatScreenQuery } from '../chat-filters';
import { AiAgentDrawer } from './ai-agent-drawer';
import { ChatChannelFilter } from './chat-channel-filter';
import { ChatFolders } from './chat-folders';
import { ChatList } from './chat-list';
import { ChatToolbar } from './chat-search-bar';
import { CommentsView } from './comments-view';
import { ConversationPanel } from './conversation-panel';
import { useCollapsedShellNavigation } from '@/components/shell-navigation-collapse';
import { useUrlQuery } from '@/lib/use-url-query';

export function ChatsScreen({ query: initial }: { query: ChatScreenQuery }) {
  const query = useUrlQuery(initial, (raw) => chatScreenQuerySchema.safeParse(raw).data);
  const router = useRouter();
  const withoutAgent = { ...query, agent: undefined, feedback: undefined };
  const folders = useInboxFolders();
  useCollapsedShellNavigation();
  return (
    <main
      data-full-width
      className="flex h-[calc(100dvh-6.5625rem)] min-h-[32rem] bg-surface text-text md:h-[calc(100dvh-3.5625rem)]"
    >
      <InboxFolders query={query} folders={folders} />
      <div
        data-chat={query.chat && query.channel !== 'comments' ? 'open' : undefined}
        className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(0,21.25rem)_minmax(0,1fr)] xl:data-[chat=open]:grid-cols-[minmax(0,21.25rem)_minmax(0,1fr)_minmax(0,20rem)]"
      >
        <InboxControls query={query} folders={folders} />
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
                className="col-start-2 row-start-2 hidden flex-col items-center justify-center gap-2 border-l border-border bg-surface-muted p-6 text-center text-text-muted lg:flex"
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

// The folder column fits beside the list, chat and customer panel only on wide screens.
const wideScreen = '(min-width: 96rem)';

function subscribeToWideScreen(onChange: () => void) {
  const media = window.matchMedia(wideScreen);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function useInboxFolders() {
  const wide = useSyncExternalStore(
    subscribeToWideScreen,
    () => window.matchMedia(wideScreen).matches,
    () => false,
  );
  const [chosen, setChosen] = useState<boolean | null>(null);
  const expanded = chosen ?? wide;
  const id = useId();
  const restoreFocus = useRef(false);
  const attachToggle = useCallback((button: HTMLButtonElement | null) => {
    if (!button || !restoreFocus.current) return;
    restoreFocus.current = false;
    button.focus();
  }, []);

  function toggle() {
    restoreFocus.current = true;
    setChosen(!expanded);
  }

  return { expanded, id, attachToggle, toggle };
}

type InboxFoldersState = ReturnType<typeof useInboxFolders>;

function InboxControls({ query, folders }: { query: ChatScreenQuery; folders: InboxFoldersState }) {
  return (
    <div
      role="group"
      aria-label="Inbox controls"
      className={cn(
        'col-start-1 row-start-1 flex min-h-14 min-w-0 flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5 lg:col-span-2',
        Boolean(query.chat || query.post) && 'hidden lg:flex',
      )}
    >
      {folders.expanded ? (
        <h1 className="text-lg font-semibold tracking-tight lg:hidden">Inbox</h1>
      ) : (
        <InboxHeading folders={folders} />
      )}
      <ChatToolbar
        query={query}
        foldersOpen={folders.expanded}
        channel={<ChatChannelFilter query={query} />}
      />
    </div>
  );
}

function InboxFolders({ query, folders }: { query: ChatScreenQuery; folders: InboxFoldersState }) {
  if (!folders.expanded) return <div id={folders.id} hidden />;

  return (
    <aside className="hidden w-54 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface-muted lg:flex">
      <div className="flex min-h-14 items-center border-b border-border px-3.5">
        <InboxHeading folders={folders} />
      </div>
      <div id={folders.id}>
        <ChatFolders query={query} />
      </div>
    </aside>
  );
}

function InboxHeading({ folders }: { folders: InboxFoldersState }) {
  const label = folders.expanded ? 'Collapse inbox folders' : 'Expand inbox folders';
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <Button
        ref={folders.attachToggle}
        variant="secondary"
        aria-label={label}
        title={label}
        aria-controls={folders.id}
        aria-expanded={folders.expanded}
        onClick={folders.toggle}
        className="hidden size-8 min-h-0 min-w-0 p-0 lg:inline-flex"
      >
        <PanelLeft aria-hidden="true" size={16} />
      </Button>
      <h1 className="text-lg font-semibold tracking-tight">Inbox</h1>
    </div>
  );
}
