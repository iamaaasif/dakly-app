import { StorePage } from '@/components/store-page';
import { ContentStudioScreen } from '@/features/content-studio/components/content-studio-screen';
import { contentStudioViewSchema } from '@/features/content-studio/content-studio-view';
import { requireSession } from '@/lib/require-session';

export default async function ContentStudioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  return (
    <StorePage permission="canViewSocial">
      <ContentStudioScreen view={contentStudioViewSchema.parse(await searchParams)} />
    </StorePage>
  );
}
