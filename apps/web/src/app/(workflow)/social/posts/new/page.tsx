import { StorePage } from '@/components/store-page';
import { CreatePostScreen } from '@/features/social/components/create-post-screen';
import { requireSession } from '@/lib/require-session';

export default async function CreatePostPage() {
  await requireSession();
  return (
    <StorePage permission="canEditSocial">
      <CreatePostScreen />
    </StorePage>
  );
}
