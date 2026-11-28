import { notFound } from 'next/navigation';
import { z } from 'zod';

import { StorePage } from '@/components/store-page';
import { EditPostScreen } from '@/features/social/components/edit-post-screen';
import { requireSession } from '@/lib/require-session';

export default async function EditPostPage({ params }: { params: Promise<{ postId: string }> }) {
  await requireSession();
  const { postId } = await params;
  const parsed = z.uuid().safeParse(postId);
  if (!parsed.success) notFound();
  return (
    <StorePage permission="canEditSocial">
      <EditPostScreen postId={parsed.data} />
    </StorePage>
  );
}
