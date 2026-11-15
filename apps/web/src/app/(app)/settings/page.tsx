import { SettingsScreen } from '@/features/settings/components/settings-screen';
import { requireSession } from '@/lib/require-session';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireSession();
  if (!session.currentStore?.canViewStoreSettings)
    return (
      <p role="status" className="p-6">
        You do not have settings access in this shop.
      </p>
    );
  const query = await searchParams;
  return <SettingsScreen tab={query.tab === 'extensions' ? 'extensions' : 'store'} />;
}
