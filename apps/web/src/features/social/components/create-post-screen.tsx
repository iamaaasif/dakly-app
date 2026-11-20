'use client';
import { useRouter } from 'next/navigation';

import { QueryError } from '@dakly/ui/query-error';

import { useContentPiece } from '../api/get-content-piece';
import { useSocialAccounts } from '../api/get-social-accounts';
import { useSavePost } from '../api/save-post';
import { PostEditor } from './post-editor/post-editor';
import { scheduleOf } from './post-editor/post-editor-types';
import { SocialHubLoading } from './social-hub-loading';

export function CreatePostScreen({ pieceId }: { pieceId: string | null }) {
  const accounts = useSocialAccounts();
  const piece = useContentPiece(pieceId);
  const save = useSavePost();
  const router = useRouter();
  const failed = accounts.error ?? piece.error;
  if (failed)
    return (
      <main className="p-4 md:p-8">
        <QueryError
          message={failed.message}
          onRetry={() => void Promise.all([accounts.refetch(), piece.refetch()])}
          retryLabel="Retry Create post"
        />
      </main>
    );
  if (!accounts.data || (pieceId && !piece.data)) return <SocialHubLoading />;
  return (
    <PostEditor
      title="Create post"
      backHref="/social/posts"
      accounts={accounts.data}
      initial={piece.data && { caption: piece.data.body, isAiWritten: piece.data.isAiWritten }}
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
