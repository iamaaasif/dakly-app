'use client';
import { MessageSquare } from 'lucide-react';

import type { ChatScreenQuery } from '../chat-filters';
import { ChatList } from './chat-list';

export function ChatsScreen({ query }: { query: ChatScreenQuery }) {
  return (
    <main className="mx-auto max-w-[120rem] space-y-4 p-4 md:p-8">
      <header>
        <h1 className="text-xl font-bold">Chats</h1>
        <p className="text-base text-text-muted">
          Messenger, WhatsApp and Instagram in one place. Turn each chat into an order.
        </p>
      </header>
      <div className="grid min-h-[36rem] overflow-hidden rounded-lg border border-border bg-surface lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <ChatList query={query} />
        <section
          aria-label="Conversation"
          className="hidden flex-col items-center justify-center gap-2 border-l border-border p-6 text-center text-text-muted lg:flex"
        >
          <MessageSquare aria-hidden="true" size={28} strokeWidth={1.5} />
          <p>Choose a chat to read it.</p>
        </section>
      </div>
    </main>
  );
}
