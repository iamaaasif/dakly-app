import { useState } from 'react';

import type { ConversationResponse } from '@dakly/contracts/chats';
import type { ConfirmProductPhotoInput } from '@dakly/contracts/products';

import { useAddNote, useSendReply } from '../api/conversation-thread';
import { replyWindow } from '../reply-window';

export type ComposerMode = 'reply' | 'note';
export type AttachedPhoto = { name: string; upload: ConfirmProductPhotoInput };

// Each tab keeps its own draft, and a reply can carry one photo. A failed send puts both back.
export function useComposerDrafts(conversation: ConversationResponse) {
  const [mode, setMode] = useState<ComposerMode>('reply');
  const [drafts, setDrafts] = useState({ reply: '', note: '' });
  const [photo, setPhoto] = useState<AttachedPhoto>();
  const sendReply = useSendReply(conversation.id);
  const addNote = useAddNote(conversation.id);
  const window = replyWindow(conversation);
  const replyOpen = window.state !== 'closed' && window.state !== 'unsupported';
  const sending = mode === 'reply' ? sendReply : addNote;
  const blocked = mode === 'reply' && !replyOpen;
  const attached = mode === 'reply' ? photo : undefined;
  const changeDraft = (target: ComposerMode, change: (draft: string) => string) =>
    setDrafts((previous) => ({ ...previous, [target]: change(previous[target]) }));

  function send() {
    const body = drafts[mode].trim();
    if ((!body && !attached) || blocked || sending.isPending) return;
    const target = mode;
    const restoreText = () => changeDraft(target, () => body);
    changeDraft(target, () => '');
    if (target === 'note') return addNote.mutate(body, { onError: restoreText });
    setPhoto(undefined);
    sendReply.mutate(
      { body, photo: attached?.upload },
      {
        onError: () => {
          restoreText();
          setPhoto(attached);
        },
      },
    );
  }

  return {
    mode,
    setMode,
    text: drafts[mode],
    changeDraft,
    photo: attached,
    setPhoto,
    send,
    sending,
    sendReply,
    blocked,
    replyOpen,
    window,
  };
}
