'use client';
import { useState } from 'react';
import { FormProvider } from 'react-hook-form';

import type { CreatePostInput } from '@dakly/contracts/social';

import type { SocialAccount } from '../../api/get-social-accounts';
import type { UploadedPostPhoto } from '../../api/upload-post-photo';
import { CaptionAiPanel } from './caption-ai-panel';
import { CaptionField } from './caption-field';
import type { CaptionSettings } from './caption-settings';
import { EditorHeader } from './editor-header';
import { PostDestinations } from './post-destinations';
import { PostDetails } from './post-details';
import {
  submitButtonLabel,
  whenLabelOf,
  type PostEditorSubmit,
  type PostWhen,
} from './post-editor-types';
import { PostPhotos } from './post-photos';
import { PostPreview } from './post-preview';
import { PostWhenField } from './post-when';
import { usePostForm } from './use-post-form';
import { usePostPreview } from './use-post-preview';
import { useWhen } from './use-when';

type PostEditorProps = {
  title: string;
  backHref: string;
  accounts: SocialAccount[];
  initial?: Partial<CreatePostInput>;
  initialPhotos?: UploadedPostPhoto[];
  pending: boolean;
  error?: string;
  onSubmit: PostEditorSubmit;
};

// Content Studio reuses this editor, so it takes the starting values and leaves saving to the caller.
export function PostEditor({
  accounts,
  initial,
  initialPhotos,
  onSubmit,
  ...frame
}: PostEditorProps) {
  const form = usePostForm(accounts, initial);
  const when = useWhen();
  const post = form.watch();
  const preview = usePostPreview(post, accounts, initialPhotos);
  const markAi = () => form.setValue('isAiWritten', true);
  const pickCaption = (caption: string) => {
    form.setValue('caption', caption, { shouldDirty: true });
    markAi();
  };
  const submit = (mode: PostWhen) => void form.handleSubmit((values) => onSubmit(values, mode))();
  const queue = () => {
    const mode = when.mode();
    if (mode) submit(mode);
  };
  return (
    <FormProvider {...form}>
      <main className="space-y-6 p-4 md:p-8">
        <EditorHeader
          title={frame.title}
          backHref={frame.backHref}
          pending={frame.pending}
          canQueue={post.targets.length > 0}
          queueLabel={submitButtonLabel(when.choice)}
          onSaveDraft={() => submit({ mode: 'draft' })}
          onQueue={queue}
        />
        <ErrorNote message={frame.error} />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <EditorColumn
            accounts={accounts}
            preview={preview}
            when={when}
            onPickCaption={pickCaption}
            onAiText={markAi}
          />
          <PreviewColumn preview={preview} whenLabel={whenLabelOf(when.choice, when.time)} />
        </div>
      </main>
    </FormProvider>
  );
}

type EditorColumnProps = {
  accounts: SocialAccount[];
  preview: ReturnType<typeof usePostPreview>;
  when: ReturnType<typeof useWhen>;
  onPickCaption: (caption: string) => void;
  onAiText: () => void;
};

function EditorColumn({ accounts, preview, when, onPickCaption, onAiText }: EditorColumnProps) {
  const [settings, setSettings] = useState<CaptionSettings>({ tone: 'friendly', language: 'en' });
  return (
    <div className="space-y-4">
      <PostDestinations accounts={accounts} />
      <CaptionAiPanel
        networkKind={
          preview.networks.join() === 'instagram' ? 'instagram_caption' : 'facebook_post'
        }
        settings={settings}
        onSettings={setSettings}
        onPick={onPickCaption}
      />
      <CaptionField accounts={accounts} settings={settings} onAiText={onAiText} />
      <PostPhotos preview={preview} />
      <PostDetails hasInstagram={preview.networks.includes('instagram')} />
      <PostWhenField
        choice={when.choice}
        time={when.time}
        timeError={when.timeError}
        onChoice={when.setChoice}
        onTime={when.setTime}
      />
    </div>
  );
}

function ErrorNote({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
      {message}
    </p>
  );
}

type PreviewColumnProps = {
  preview: ReturnType<typeof usePostPreview>;
  whenLabel: string;
};

function PreviewColumn({ preview, whenLabel }: PreviewColumnProps) {
  return (
    <div>
      <div className="lg:sticky lg:top-20">
        <PostPreview {...preview} whenLabel={whenLabel} />
      </div>
    </div>
  );
}
