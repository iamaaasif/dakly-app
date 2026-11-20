import { Suspense } from 'react';

import { StorePage } from '@/components/store-page';
import { MyPostsScreen } from '@/features/social/components/my-posts-screen';
import { SocialHubLoading } from '@/features/social/components/social-hub-loading';
import { requireSession } from '@/lib/require-session';

export default async function MyPostsPage() {
  await requireSession();
  return (
    <StorePage permission="canViewSocial">
      <Suspense fallback={<SocialHubLoading />}>
        <MyPostsScreen />
      </Suspense>
    </StorePage>
  );
}
