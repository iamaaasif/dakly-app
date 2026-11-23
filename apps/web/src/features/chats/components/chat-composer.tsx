'use client';
import { Send } from 'lucide-react';
import { useState } from 'react';

import type { ConversationResponse } from '@dakly/contracts/chats';
import { Button } from '@dakly/ui/button';
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
  const [text, setText] = useState('');
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
  return (
    <div className="shrink-0 space-y-2 border-t border-border p-3">
      <ModeTabs mode={mode} onChange={setMode} />
      <ComposerHint mode={mode} windowLabel={window.state === 'open' ? null : window.label} />
      {mode === 'reply' ? <SavedRepliesPicker onPick={setText} /> : null}
      <WriteBox
        mode={mode}
        text={text}
        disabled={blocked}
        pending={sending.isPending}
        onChange={setText}
        onSend={() => {
          // The box clears at once, like a chat app; a failed send puts the words back.
          const body = text.trim();
          setText('');
          sending.mutate(body, { onError: () => setText(body) });
        }}
      />
      {sending.error ? (
        <p role="alert" className="text-danger">
          {sending.error.message}
        </p>
      ) : null}
    </div>
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

function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Message type"
      className="inline-flex rounded-lg bg-surface-muted p-1"
    >
      {(['reply', 'note'] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={mode === value}
          className="min-h-8 rounded-md px-3 text-base text-text-muted aria-selected:bg-surface aria-selected:font-semibold aria-selected:text-text"
          onClick={() => onChange(value)}
        >
          {modeLabels[value]}
        </button>
      ))}
    </div>
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
    <div className="flex items-end gap-2">
      <Textarea
        aria-label={reply ? 'Write a reply' : 'Write an internal note'}
        placeholder={reply ? 'Write a reply' : 'Write a note for your team'}
        maxLength={reply ? 2000 : 4000}
        value={text}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-16"
      />
      <Button
        type="button"
        aria-label={reply ? 'Send reply' : 'Save note'}
        disabled={disabled || !text.trim() || pending}
        onClick={onSend}
      >
        <Send aria-hidden="true" size={16} strokeWidth={1.75} />
      </Button>
    </div>
  );
}
