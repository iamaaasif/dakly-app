import { StorePage } from '@/components/store-page';
import { AutomationsScreen } from '@/features/automations/components/automations-screen';
import { requireSession } from '@/lib/require-session';

export default async function AutomationsPage() {
  await requireSession();
  return (
    <StorePage permission="canViewAutomations">
      <AutomationsScreen />
    </StorePage>
  );
}
