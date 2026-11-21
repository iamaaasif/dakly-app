import { StorePage } from '@/components/store-page';
import { ExtensionsScreen } from '@/features/extensions/components/extensions-screen';
import { requireSession } from '@/lib/require-session';

export default async function ExtensionsPage() {
  await requireSession();
  return (
    <StorePage permission="canViewStoreSettings">
      <ExtensionsScreen />
    </StorePage>
  );
}
