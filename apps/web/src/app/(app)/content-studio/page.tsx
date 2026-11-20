import { StorePage } from '@/components/store-page';
import { ContentStudioScreen } from '@/features/content-studio/components/content-studio-screen';
import { contentStudioTabSchema } from '@/features/content-studio/content-studio-view';
import { requireSession } from '@/lib/require-session';

export default async function ContentStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireSession();
  const { tab } = await searchParams;
  return (
    <StorePage permission="canViewSocial">
      <ContentStudioScreen tab={contentStudioTabSchema.parse(tab)} />
    </StorePage>
  );
}
