'use client';
import { useRouter, useSearchParams } from 'next/navigation';

import { adminShopStatuses } from '@dakly/contracts/admin-shops';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

import { statusLabel } from './shop-status';

// Filters live in the URL so a search can be shared and survives a reload.
export function ShopFilters() {
  const params = useSearchParams();
  const router = useRouter();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_12rem_auto]"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const query = new URLSearchParams();
        for (const [key, value] of new FormData(event.currentTarget))
          if (String(value).trim()) query.set(key, String(value).trim());
        router.push(`/shops?${query}`);
      }}
    >
      <label className="space-y-1">
        <span className="text-muted text-sm">Search shops</span>
        <Input
          name="search"
          defaultValue={params.get('search') ?? ''}
          placeholder="Name, slug, shop ID, owner phone or page ID"
        />
      </label>
      <label className="space-y-1">
        <span className="text-muted text-sm">Status</span>
        <select
          name="status"
          defaultValue={params.get('status') ?? ''}
          className="h-10 w-full rounded-md border border-border bg-surface px-3 text-text"
        >
          <option value="">All statuses</option>
          {adminShopStatuses.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" className="self-end">
        Search
      </Button>
    </form>
  );
}
