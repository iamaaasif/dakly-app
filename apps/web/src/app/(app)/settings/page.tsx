import { SettingsScreen } from '@/features/settings/components/settings-screen';
import { requireSession } from '@/lib/require-session';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireSession();
  const query = await searchParams;
  return <SettingsScreen tab={query.tab === 'extensions' ? 'extensions' : 'store'} />;
}
