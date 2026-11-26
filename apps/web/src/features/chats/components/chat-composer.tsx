'use client';
import { Send } from 'lucide-react';
import { useState } from 'react';

import type { ConversationResponse } from '@dakly/contracts/chats';
import { Button } from '@dakly/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dakly/ui/tabs';
import { Textarea } from '@dakly/ui/textarea';

import { useAddNote, useSendReply } from '../api/conversation-thread';
import { replyWindow } from '../reply-window';
import { SavedRepliesPicker } from './saved-replies-picker';
import { useSessionContext } from '@/lib/session-context';

type Mode = 'reply' | 'note';

const modeLabels: Record<Mode, string> = { reply: 'Reply', note: 'Internal note' };

export function ChatComposer({ conversation }: { conversation: ConversationResponse }) {
  const { data: session } = useSessionContext();
  const [mode, setMode] = useState<Mode>('reply');
  const [drafts, setDrafts] = useState({ reply: '', note: '' });
  const text = drafts[mode];
  const sendReply = useSendReply(conversation.id);
  const addNote = useAddNote(conversation.id);
  const window = replyWindow(conversation);
  const sending = mode === 'reply' ? sendReply : addNote;
  const blocked = mode === 'reply' && (window.state === 'closed' || window.state === 'unsupported');

  if (!session?.currentStore?.canEditChats)
    return (
      <p className="border-t border-border p-3 text-text-muted">
        You can read this chat. Replying needs Edit Chats access.
      </p>
    );
  function send() {
    const body = text.trim();
    if (!body || blocked || sending.isPending) return;
    setDrafts((previous) => ({ ...previous, [mode]: '' }));
    sending.mutate(body, {
      onError: () => setDrafts((previous) => ({ ...previous, [mode]: body })),
    });
  }

  return (
    <Tabs
      value={mode}
      onValueChange={(value) => setMode(value === 'note' ? 'note' : 'reply')}
      className="shrink-0 space-y-2 border-t border-border bg-surface px-3 pt-2 pb-3"
    >
      <ModeTabs />
      <TabsContent value={mode} className="space-y-2 pt-0">
        <ComposerHint mode={mode} windowLabel={window.state === 'open' ? null : window.label} />
        <WriteBox
          mode={mode}
          text={text}
          disabled={blocked}
          pending={sending.isPending}
          onChange={(value) => setDrafts((previous) => ({ ...previous, [mode]: value }))}
          onSend={send}
        />
        {sending.error ? (
          <p role="alert" className="text-sm text-danger">
            {sending.error.message}
          </p>
        ) : null}
      </TabsContent>
    </Tabs>
  );
}

function ComposerHint({ mode, windowLabel }: { mode: Mode; windowLabel: string | null }) {
  if (mode === 'note')
    return (
      <p className="text-sm text-text-muted">Only your team sees a note. The customer does not.</p>
    );
  return windowLabel ? (
    <p role="status" className="text-sm text-text-muted">
      {windowLabel}
    </p>
  ) : null;
}

function ModeTabs() {
  return (
    <TabsList
      aria-label="Message type"
      className="inline-flex gap-0.5 rounded-md border-0 bg-surface-muted p-0.5"
    >
      {(['reply', 'note'] as const).map((value) => (
        <TabsTrigger
          key={value}
          value={value}
          className="mb-0 min-h-10 rounded-md border-0 px-3 text-sm data-[state=active]:bg-surface data-[state=active]:font-semibold md:min-h-8"
        >
          {modeLabels[value]}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

type WriteBoxProps = {
  mode: Mode;
  text: string;
  disabled: boolean;
  pending: boolean;
  onChange: (text: string) => void;
  onSend: () => void;
};

function WriteBox({ mode, text, disabled, pending, onChange, onSend }: WriteBoxProps) {
  const reply = mode === 'reply';
  return (
    <div className="rounded-md border border-border-strong bg-surface focus-within:border-focus">
      <Textarea
        aria-label={reply ? 'Write a reply' : 'Write an internal note'}
        placeholder={reply ? 'Write a reply' : 'Write a note for your team'}
        maxLength={reply ? 2000 : 4000}
        value={text}
        disabled={disabled}
        readOnly={pending}
        onKeyDown={(event) => {
          if (
            event.key !== 'Enter' ||
            !(event.metaKey || event.ctrlKey) ||
            event.nativeEvent.isComposing
          )
            return;
          event.preventDefault();
          onSend();
        }}
        onChange={(event) => onChange(event.target.value)}
        className="block max-h-32 min-h-16 resize-y rounded-b-none border-0 bg-transparent text-sm focus-visible:outline-none"
      />
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 border-t border-border px-2 py-2">
        {reply ? <SavedRepliesPicker disabled={disabled || pending} onPick={onChange} /> : null}
        <Button
          type="button"
          aria-label={reply ? 'Send reply' : 'Save note'}
          disabled={disabled || !text.trim() || pending}
          size="sm"
          className="ml-auto"
          onClick={onSend}
        >
          <Send aria-hidden="true" size={16} />
          {reply ? 'Send' : 'Save note'}
        </Button>
      </div>
    </div>
  );
}
