'use client';
import { useRouter } from 'next/navigation';

import { QueryError } from '@dakly/ui/query-error';

import { useSocialAccounts } from '../api/get-social-accounts';
import { useSavePost } from '../api/save-post';
import { PostEditor } from './post-editor/post-editor';
import { scheduleOf } from './post-editor/post-editor-types';
import { SocialHubLoading } from './social-hub-loading';

export function CreatePostScreen() {
  const accounts = useSocialAccounts();
  const save = useSavePost();
  const router = useRouter();
  if (accounts.error)
    return (
      <main className="p-4 md:p-8">
        <QueryError
          message={accounts.error.message}
          onRetry={() => void accounts.refetch()}
          retryLabel="Retry Create post"
        />
      </main>
    );
  if (!accounts.data) return <SocialHubLoading />;
  return (
    <PostEditor
      title="Create post"
      backHref="/social/posts"
      accounts={accounts.data}
      pending={save.isPending}
      error={save.error?.message}
      onSubmit={(post, when) =>
        save.mutate(
          { post, schedule: scheduleOf(when) },
          { onSuccess: () => router.push('/social/posts') },
        )
      }
    />
  );
}
