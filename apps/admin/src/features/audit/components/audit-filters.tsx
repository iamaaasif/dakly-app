'use client';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';

import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { Input } from '@dakly/ui/input';

export function AuditFilters() {
  const params = useSearchParams();
  const router = useRouter();
  return (
    <Card>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const query = new URLSearchParams();
          for (const [key, value] of data) if (value) query.set(key, String(value));
          router.push(`/audit?${query}`);
        }}
      >
        {['action', 'staffUserId', 'storeId', 'from', 'to'].map((key) => (
          <label key={key}>
            {key}
            <Input
              name={key}
              defaultValue={params.get(key) ?? ''}
              placeholder={key === 'from' || key === 'to' ? '2026-11-14T00:00:00Z' : undefined}
            />
          </label>
        ))}
        <Button type="submit">Search history</Button>
        <Link href="/audit" className="text-action underline">
          Clear filters
        </Link>
      </form>
    </Card>
  );
}
