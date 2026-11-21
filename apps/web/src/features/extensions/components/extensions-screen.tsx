'use client';
import { useState } from 'react';

import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';
import { useToast } from '@dakly/ui/toast';

import { useChangeExtensions, useStoreExtensions } from '../api/extensions';
import { ExtensionCard } from './extension-card';
import { extensionCards, type ExtensionCard as ExtensionCardData } from './extension-catalog';
import { useSessionContext } from '@/lib/session-context';

type ChangeableName = ExtensionCardData['name'];

export function ExtensionsScreen() {
  const { data: session } = useSessionContext();
  const store = useStoreExtensions();
  const canChange = Boolean(session?.currentStore?.canChangeExtensions);
  const enabled = new Set<string>(store.data?.extensions ?? []);
  const { toggle, saving, failure } = useToggleExtension(enabled);
  return (
    <main className="space-y-6 p-4 md:p-8">
      <ExtensionsHeader
        count={store.data ? extensionCards.filter(({ name }) => enabled.has(name)).length : null}
      />
      {store.error ? (
        <QueryError message={store.error.message} onRetry={() => void store.refetch()} />
      ) : null}
      {failure ? (
        <p role="alert" className="text-danger">
          {failure}
        </p>
      ) : null}
      {store.isPending ? <Skeleton className="h-64 w-full" /> : null}
      {store.data ? (
        <ExtensionGrid
          enabled={enabled}
          canChange={canChange}
          saving={saving}
          onToggle={(name, on) => void toggle(name, on)}
        />
      ) : null}
    </main>
  );
}

function ExtensionGrid(props: {
  enabled: Set<string>;
  canChange: boolean;
  saving: boolean;
  onToggle: (name: ChangeableName, on: boolean) => void;
}) {
  const { enabled, canChange, saving, onToggle } = props;
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {extensionCards.map((card) => (
          <ExtensionCard
            key={card.name}
            card={card}
            on={enabled.has(card.name)}
            canChange={canChange}
            saving={saving}
            onToggle={(on) => onToggle(card.name, on)}
          />
        ))}
      </div>
      {canChange ? null : (
        <p className="text-sm text-text-muted">Only the Owner or an Admin can change extensions.</p>
      )}
    </>
  );
}

function ExtensionsHeader({ count }: { count: number | null }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">Extensions</h1>
        <p className="mt-1 text-sm text-text-muted">
          Turn on only what fits how you sell. Turned-off extensions are hidden from the menu, and
          your data is kept.
        </p>
      </div>
      {count === null ? null : (
        <p className="rounded-full bg-surface-muted px-3 py-1 text-sm font-semibold">
          {count} of {extensionCards.length} on
        </p>
      )}
    </div>
  );
}

function useToggleExtension(enabled: Set<string>) {
  const change = useChangeExtensions();
  const showToast = useToast();
  const [failure, setFailure] = useState<string | null>(null);

  async function toggle(name: ChangeableName, on: boolean) {
    const next = extensionCards
      .map((card) => card.name)
      .filter((item) => (item === name ? on : enabled.has(item)));
    setFailure(null);
    try {
      await change.mutateAsync({ extensions: next });
      const title = extensionCards.find((card) => card.name === name)?.title ?? name;
      showToast(on ? `${title} turned on.` : `${title} turned off. Your data is kept.`);
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : 'Could not change extensions. Try again.',
      );
    }
  }
  return { toggle, saving: change.isPending, failure };
}
