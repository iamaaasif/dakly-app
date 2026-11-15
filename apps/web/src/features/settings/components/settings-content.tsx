'use client';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useStoreSettings } from '../api/store-settings';
import { ExtensionsForm } from './extensions-form';
import { StoreForm } from './store-form';
import { useSessionContext } from '@/lib/session-context';

export function SettingsContent({ tab }: { tab: 'store' | 'extensions' }) {
  const settings = useStoreSettings();
  const { data: session } = useSessionContext();
  if (settings.isPending) return <Skeleton className="h-64 w-full" />;
  const Form = tab === 'store' ? StoreForm : ExtensionsForm;
  const access = session?.currentStore;
  const editable = tab === 'store' ? access?.canEditStoreSettings : access?.canChangeExtensions;
  return (
    <>
      {settings.error ? (
        <QueryError message={settings.error.message} onRetry={() => void settings.refetch()} />
      ) : null}
      {settings.data ? <Form store={settings.data} editable={Boolean(editable)} /> : null}
    </>
  );
}
