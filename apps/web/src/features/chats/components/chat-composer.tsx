'use client';
import { Send } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';

import type { ConversationResponse } from '@dakly/contracts/chats';
import { Button } from '@dakly/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dakly/ui/tabs';
import { Textarea } from '@dakly/ui/textarea';

import { chatChannelLabels } from '../chat-filters';
import { contactDisplayName } from '../contact-name';
import {
  type AttachedPhoto,
  type ComposerMode,
  useComposerDrafts,
} from '../hooks/use-composer-drafts';
import { AiWritingTool } from './ai-writing-tool';
import { AttachedPhotoChip, AttachPhotoButton } from './attach-photo';
import { EmojiPicker } from './emoji-picker';
import { OrderLinkTool, SendProductTool } from './product-reply-tools';
import { SavedRepliesPicker } from './saved-replies-picker';
import { SuggestedReply } from './suggested-reply-card';
import { useSessionContext } from '@/lib/session-context';

const modeLabels: Record<ComposerMode, string> = { reply: 'Reply', note: 'Internal note' };

export function ChatComposer({ conversation }: { conversation: ConversationResponse }) {
  const { data: session } = useSessionContext();
  if (!session?.currentStore?.canEditChats)
    return (
      <p className="border-t border-border p-3 text-text-muted">
        You can read this chat. Replying needs Edit Chats access.
      </p>
    );
  return <EditableComposer conversation={conversation} />;
}

function EditableComposer({ conversation }: { conversation: ConversationResponse }) {
  const composer = useComposerDrafts(conversation);
  const { mode, changeDraft, sending, blocked, window } = composer;
  const busy = blocked || sending.isPending;
  return (
    <>
      {composer.replyOpen ? (
        <SuggestedReply
          conversation={conversation}
          sendReply={composer.sendReply}
          onEdit={(body) => {
            composer.setMode('reply');
            changeDraft('reply', () => body);
          }}
        />
      ) : null}
      <Tabs
        value={mode}
        onValueChange={(value) => composer.setMode(value === 'note' ? 'note' : 'reply')}
        className="shrink-0 space-y-2 border-t border-border bg-surface px-3 pt-2 pb-3"
      >
        <ModeTabs />
        <TabsContent value={mode} className="space-y-2 pt-0">
          <ComposerHint mode={mode} windowLabel={window.state === 'open' ? null : window.label} />
          <WriteBox
            replyPlaceholder={`Write a reply to ${contactDisplayName(conversation)} via ${chatChannelLabels[conversation.channel]}…`}
            mode={mode}
            text={composer.text}
            canSend={Boolean(composer.text.trim() || composer.photo)}
            disabled={blocked}
            pending={sending.isPending}
            onChange={(value) => changeDraft(mode, () => value)}
            onSend={composer.send}
            attachment={
              <AttachedPhotoChip
                photo={composer.photo}
                onRemove={() => composer.setPhoto(undefined)}
              />
            }
            tools={
              <ReplyTools
                conversationId={conversation.id}
                reply={composer.text}
                disabled={busy}
                changeReply={(change) => changeDraft('reply', change)}
                onAttach={composer.setPhoto}
              />
            }
          />
          <SendError error={sending.error} />
        </TabsContent>
      </Tabs>
    </>
  );
}

type ReplyToolsProps = {
  conversationId: string;
  reply: string;
  disabled: boolean;
  changeReply: (change: (draft: string) => string) => void;
  onAttach: (photo: AttachedPhoto) => void;
};

// In the order of the design: emoji, attach, AI rewrite, saved replies, send product, Write with AI,
// then order link.
function ReplyTools({ conversationId, reply, disabled, changeReply, onAttach }: ReplyToolsProps) {
  const writing = {
    conversationId,
    text: reply,
    disabled,
    onWritten: (text: string) => changeReply(() => text),
  };
  return (
    <>
      <EmojiPicker disabled={disabled} onPick={(item) => changeReply((draft) => draft + item)} />
      <AttachPhotoButton conversationId={conversationId} disabled={disabled} onAttach={onAttach} />
      <AiWritingTool mode="rewrite" {...writing} />
      <SavedRepliesPicker disabled={disabled} onPick={(body) => changeReply(() => body)} />
      <SendProductTool conversationId={conversationId} disabled={disabled} />
      <AiWritingTool mode="write" {...writing} />
      <OrderLinkTool
        disabled={disabled}
        onOrderLink={(url) => changeReply((draft) => withLink(draft, url))}
      />
    </>
  );
}

function SendError({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="text-sm text-danger">
      {error.message}
    </p>
  ) : null;
}

// An order link goes after what is already typed, on its own line.
function withLink(text: string, url: string) {
  return text.trim() ? `${text.trimEnd()}\n${url}` : url;
}

function ComposerHint({ mode, windowLabel }: { mode: ComposerMode; windowLabel: string | null }) {
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

// Ctrl or Cmd with Enter sends; a plain Enter is a new line, and Bangla input keeps its composition.
function sendOnShortcut(event: KeyboardEvent<HTMLTextAreaElement>, onSend: () => void) {
  if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || event.nativeEvent.isComposing)
    return;
  event.preventDefault();
  onSend();
}

const boxCopy = {
  reply: {
    label: 'Write a reply',
    placeholder: undefined,
    maxLength: 2000,
    sendLabel: 'Send reply',
    send: 'Send',
  },
  note: {
    label: 'Write an internal note',
    placeholder: 'Write a note for your team',
    maxLength: 4000,
    sendLabel: 'Save note',
    send: 'Save note',
  },
};

type WriteBoxProps = {
  replyPlaceholder: string;
  mode: ComposerMode;
  text: string;
  disabled: boolean;
  pending: boolean;
  onChange: (text: string) => void;
  onSend: () => void;
  canSend: boolean;
  attachment: ReactNode;
  tools: ReactNode;
};

function WriteBox({
  replyPlaceholder,
  mode,
  text,
  disabled,
  pending,
  onChange,
  onSend,
  canSend,
  attachment,
  tools,
}: WriteBoxProps) {
  const reply = mode === 'reply';
  const copy = boxCopy[mode];
  return (
    <div className="rounded-md border border-border-strong bg-surface focus-within:border-focus">
      <Textarea
        aria-label={copy.label}
        placeholder={copy.placeholder ?? replyPlaceholder}
        maxLength={copy.maxLength}
        value={text}
        disabled={disabled}
        readOnly={pending}
        onKeyDown={(event) => sendOnShortcut(event, onSend)}
        onChange={(event) => onChange(event.target.value)}
        className="block max-h-32 min-h-16 resize-y rounded-b-none border-0 bg-transparent text-sm focus-visible:outline-none"
      />
      {reply ? attachment : null}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 px-2 pb-2">
        {reply ? tools : null}
        <Button
          type="button"
          aria-label={copy.sendLabel}
          disabled={disabled || !canSend || pending}
          size="sm"
          className="ml-auto"
          onClick={onSend}
        >
          <Send aria-hidden="true" size={16} />
          {copy.send}
        </Button>
      </div>
    </div>
  );
}
