import { redirect } from 'next/navigation';

import { SmsSettings } from '@/features/integrations/components/sms-settings';
import { SettingsScreen } from '@/features/settings/components/settings-screen';
import { requireSession } from '@/lib/require-session';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireSession();
  const query = await searchParams;
  if (query.tab === 'extensions') redirect('/extensions');
  return <SettingsScreen tab={settingsTab(query.tab)} sms={<SmsSettings />} />;
}

function settingsTab(tab: string | undefined) {
  return tab === 'sms' ? tab : 'store';
}
