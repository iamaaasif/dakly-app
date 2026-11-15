'use client';
import Link from 'next/link';
import { useState } from 'react';

import type { StaffRecoveryTarget } from '@dakly/contracts/staff-recovery';

import { RecoveryForm } from './recovery-form';
import { RecoveryLookup } from './recovery-lookup';

export function RecoveryScreen() {
  const [target, setTarget] = useState<StaffRecoveryTarget>();
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 md:p-8">
      <Link href="/" className="text-action underline">
        Staff home
      </Link>
      <h1 className="text-2xl font-semibold">Recover a shop account</h1>
      <RecoveryLookup onSelect={setTarget} />
      {target ? (
        <RecoveryForm key={target.id} target={target} />
      ) : (
        <p>Find the account using its old verified contact.</p>
      )}
    </main>
  );
}
