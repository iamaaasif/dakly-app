import { z } from 'zod';

import { StorePage } from '@/components/store-page';
import { CreatePostScreen } from '@/features/social/components/create-post-screen';
import { requireSession } from '@/lib/require-session';

export default async function CreatePostPage({
  searchParams,
}: {
  searchParams: Promise<{ piece?: string }>;
}) {
  await requireSession();
  const { piece } = await searchParams;
  return (
    <StorePage permission="canEditSocial">
      <CreatePostScreen pieceId={z.uuid().safeParse(piece).data ?? null} />
    </StorePage>
  );
}
