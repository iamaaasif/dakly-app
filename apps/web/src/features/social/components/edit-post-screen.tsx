'use client';
import { useRouter } from 'next/navigation';

import type { PostResponse } from '@dakly/contracts/social';
import { QueryError } from '@dakly/ui/query-error';

import { usePost } from '../api/get-post';
import { useSocialAccounts } from '../api/get-social-accounts';
import { useUpdateDraft } from '../api/update-draft';
import { PostEditor } from './post-editor/post-editor';
import { scheduleOf } from './post-editor/post-editor-types';
import { SocialHubLoading } from './social-hub-loading';

function startingValues(post: PostResponse) {
  const { kind, caption, mediaFileIds, linkUrl, firstComment, isAiWritten } = post;
  const targets = post.targets.map(({ channelConnectionId, captionOverride }) => ({
    channelConnectionId,
    captionOverride,
  }));
  return { kind, caption, mediaFileIds, linkUrl, firstComment, isAiWritten, targets };
}

export function EditPostScreen({ postId }: { postId: string }) {
  const accounts = useSocialAccounts();
  const post = usePost(postId);
  const update = useUpdateDraft();
  const router = useRouter();
  const failed = accounts.error ?? post.error;
  if (failed)
    return (
      <main className="p-4 md:p-8">
        <QueryError
          message={failed.message}
          onRetry={() => void Promise.all([accounts.refetch(), post.refetch()])}
          retryLabel="Retry Edit post"
        />
      </main>
    );
  if (!accounts.data || !post.data) return <SocialHubLoading />;
  return (
    <PostEditor
      title="Edit draft"
      backHref="/social/posts?tab=draft"
      accounts={accounts.data}
      initial={startingValues(post.data)}
      initialPhotos={post.data.photos}
      pending={update.isPending}
      error={update.error?.message}
      onSubmit={(values, when) =>
        update.mutate(
          { postId, post: values, schedule: scheduleOf(when) },
          {
            onSuccess: () =>
              router.push(when.mode === 'draft' ? '/social/posts?tab=draft' : '/social/posts'),
          },
        )
      }
    />
  );
}
