import { StorePage } from '@/components/store-page';
import { IntegrationsScreen } from '@/features/integrations/components/integrations-screen';
import { requireSession } from '@/lib/require-session';

export default async function IntegrationsPage() {
  await requireSession();
  return (
    <StorePage permission="canViewStoreSettings">
      <IntegrationsScreen />
    </StorePage>
  );
}
