import { StorePage } from '@/components/store-page';
import { SocialHubScreen } from '@/features/social/components/social-hub-screen';
import { requireSession } from '@/lib/require-session';

export default async function SocialPage() {
  await requireSession();
  return (
    <StorePage permission="canViewSocial">
      <SocialHubScreen />
    </StorePage>
  );
}
