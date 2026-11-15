'use client';
import Link from 'next/link';
import { Button } from '@dakly/ui/button';
import { Skeleton } from '@dakly/ui/skeleton';
import { StorePage } from '@/components/store-page';
import { useSessionContext } from '@/lib/session-context';
import { useStoreSettings } from '../api/store-settings';
import { StoreForm } from './store-form';
import { ExtensionsForm } from './extensions-form';
export function SettingsScreen({ tab }: { tab: 'store' | 'extensions' }) {
  return (
    <StorePage permission="canViewStoreSettings">
      <main className="max-w-4xl space-y-6 p-4 md:p-8">
        <h1 className="text-xl font-bold">Store settings</h1>
        <nav aria-label="Settings sections" className="flex flex-wrap gap-4">
          {(['store', 'extensions'] as const).map((item) => (
            <Link
              key={item}
              href={`/settings?tab=${item}`}
              aria-current={tab === item ? 'page' : undefined}
              className="inline-flex min-h-10 items-center text-action underline"
            >
              {item === 'store' ? 'Store information' : 'Extensions'}
            </Link>
          ))}
        </nav>
        <SettingsContent tab={tab} />
      </main>
    </StorePage>
  );
}

function SettingsContent({ tab }: { tab: 'store' | 'extensions' }) {
  const settings = useStoreSettings();
  const { data: session } = useSessionContext();
  if (settings.isPending) return <Skeleton className="h-64 w-full" />;
  const Form = tab === 'store' ? StoreForm : ExtensionsForm;
  const access = session?.currentStore;
  const editable = tab === 'store' ? access?.canEditStoreSettings : access?.canChangeExtensions;
  return (
    <>
      {settings.error ? (
        <div role="alert">
          <p>{settings.error.message}</p>
          <Button onClick={() => void settings.refetch()}>Retry</Button>
        </div>
      ) : null}
      {settings.data ? <Form store={settings.data} editable={Boolean(editable)} /> : null}
    </>
  );
}
