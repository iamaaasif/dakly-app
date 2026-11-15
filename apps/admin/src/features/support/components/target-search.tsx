'use client';
import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { Card } from '@dakly/ui/card';
import { useSupportTargets } from '../api/support';

export function TargetSearch({
  onSelect,
}: {
  onSelect: (target: { id: string; name: string }) => void;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(params.get('query') ?? '');
  const targets = useSupportTargets(params.get('query') ?? '');
  return (
    <Card>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          router.replace(`/support?query=${encodeURIComponent(query)}`);
        }}
      >
        <label htmlFor="target">Shop ID or exact shop slug</label>
        <Input
          id="target"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          required
          minLength={3}
        />
        <Button type="submit">Find shop</Button>
      </form>
      {targets.isFetching ? <p role="status">Finding shop…</p> : null}
      {targets.error ? <p role="alert">{targets.error.message}</p> : null}
      {targets.data?.length === 0 ? <p>No shop found.</p> : null}
      {targets.data?.map((target) => (
        <Button key={target.id} variant="secondary" onClick={() => onSelect(target)}>
          {target.name}
        </Button>
      ))}
    </Card>
  );
}
