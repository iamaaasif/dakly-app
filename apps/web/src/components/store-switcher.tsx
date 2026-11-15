import type { SessionContext } from '@dakly/contracts/sessions';

type StoreSwitcherProps = { session: SessionContext; onSwitch: (storeId: string) => Promise<void> };
export function StoreSwitcher({ session, onSwitch }: StoreSwitcherProps) {
  if (!session.stores.length) return <p className="text-text-muted">No shop yet</p>;
  if (session.stores.length === 1 && session.currentStore)
    return <p className="min-w-0 font-semibold break-words">{session.currentStore.name}</p>;
  return (
    <div className="min-w-0 flex-1 space-y-1 md:max-w-sm">
      <label htmlFor="active-shop" className="block text-sm text-text-muted">
        Current shop
      </label>
      <select
        id="active-shop"
        value={session.currentStore?.storeId ?? ''}
        onChange={(event) => void onSwitch(event.target.value)}
        className="min-h-10 w-full min-w-0 rounded-md border border-input-border bg-surface px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <option value="" disabled>
          Choose a shop
        </option>
        {session.stores.map((store) => (
          <option key={store.storeId} value={store.storeId}>
            {store.name}
          </option>
        ))}
      </select>
    </div>
  );
}
