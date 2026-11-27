'use client';
import { useState } from 'react';
import { FormProvider } from 'react-hook-form';

import type { CreatePostInput } from '@dakly/contracts/social';

import type { SocialAccount } from '../../api/get-social-accounts';
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
  pending: boolean;
  error?: string;
  onSubmit: PostEditorSubmit;
};

// Content Studio reuses this editor, so it takes the starting values and leaves saving to the caller.
export function PostEditor({ accounts, initial, onSubmit, ...frame }: PostEditorProps) {
  const form = usePostForm(accounts, initial);
  const [settings, setSettings] = useState<CaptionSettings>({ tone: 'friendly', language: 'en' });
  const when = useWhen();
  const post = form.watch();
  const preview = usePostPreview(post, accounts);
  const markAi = () => form.setValue('isAiWritten', true);
  const submit = (mode: PostWhen) => void form.handleSubmit((values) => onSubmit(values, mode))();
  const queue = () => {
    const mode = when.mode();
    if (mode) submit(mode);
  };
  return (
    <FormProvider {...form}>
      <main className="min-h-screen bg-background">
        <EditorHeader
          title={frame.title}
          backHref={frame.backHref}
          pending={frame.pending}
          canQueue={post.targets.length > 0}
          queueLabel={submitButtonLabel(when.choice)}
          onSaveDraft={() => submit({ mode: 'draft' })}
          onQueue={queue}
        />
        {frame.error && (
          <p role="alert" className="m-4 rounded-md bg-danger-soft p-3 text-sm text-danger md:mx-6">
            {frame.error}
          </p>
        )}
        <div className="grid lg:grid-cols-[minmax(0,7fr)_minmax(0,8fr)]">
          <div className="space-y-4 p-4 md:p-6">
            <PostDestinations accounts={accounts} />
            <CaptionAiPanel
              networkKind={
                preview.networks.join() === 'instagram' ? 'instagram_caption' : 'facebook_post'
              }
              settings={settings}
              onSettings={setSettings}
              onPick={(caption) => {
                form.setValue('caption', caption, { shouldDirty: true });
                markAi();
              }}
            />
            <CaptionField accounts={accounts} settings={settings} onAiText={markAi} />
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
          <PreviewColumn preview={preview} whenLabel={whenLabelOf(when.choice, when.time)} />
        </div>
      </main>
    </FormProvider>
  );
}

type PreviewColumnProps = {
  preview: ReturnType<typeof usePostPreview>;
  whenLabel: string;
};

function PreviewColumn({ preview, whenLabel }: PreviewColumnProps) {
  return (
    <div className="bg-surface-muted p-4 md:p-6 lg:min-h-[calc(100vh-3.5625rem)]">
      <div className="lg:sticky lg:top-24">
        <PostPreview {...preview} whenLabel={whenLabel} />
      </div>
    </div>
  );
}
