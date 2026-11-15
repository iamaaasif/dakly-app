'use client';
import { BreakGlassForm } from './break-glass-form';
import { useState } from 'react';
import Link from 'next/link';
import { TargetSearch } from './target-search';
import { RequestForm } from './request-form';
import { RequestList } from './request-list';
export function SupportScreen({ canBreakGlass }: { canBreakGlass: boolean }) {
  const [target, setTarget] = useState<{ id: string; name: string }>();
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4">
      <Link href="/" className="text-action underline">
        Staff home
      </Link>
      <h1 className="text-xl font-semibold">Support access</h1>
      <p>
        Ask the Owner for time-limited access. Supported now: read a customer by ID and create
        customers. Account, team, ownership and billing controls are unavailable.
      </p>
      <TargetSearch onSelect={setTarget} />
      <RequestForm target={target} />
      {canBreakGlass ? <BreakGlassForm key={target?.id} target={target} /> : null}
      <RequestList />
    </main>
  );
}
