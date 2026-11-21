'use client';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useStoreSettings } from '../api/store-settings';
import { StoreForm } from './store-form';
import { useSessionContext } from '@/lib/session-context';

export function SettingsContent() {
  const settings = useStoreSettings();
  const { data: session } = useSessionContext();
  if (settings.isPending) return <Skeleton className="h-64 w-full" />;
  return (
    <>
      {settings.error ? (
        <QueryError message={settings.error.message} onRetry={() => void settings.refetch()} />
      ) : null}
      {settings.data ? (
        <StoreForm
          store={settings.data}
          editable={Boolean(session?.currentStore?.canEditStoreSettings)}
        />
      ) : null}
    </>
  );
}
