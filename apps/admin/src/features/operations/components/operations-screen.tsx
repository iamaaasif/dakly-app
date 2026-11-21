'use client';
import Link from 'next/link';

import type { StaffIdentity } from '@dakly/contracts/staff-auth';

import { AiCostPanel } from './ai-cost-panel';
import { KillSwitchPanel } from './kill-switch-panel';
import { ProviderHealthPanel } from './provider-health-panel';

const writeRoles: StaffIdentity['role'][] = ['super_admin', 'ops'];

export function OperationsScreen({ role }: { role: StaffIdentity['role'] }) {
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4">
      <Link href="/" className="text-action underline">
        Staff home
      </Link>
      <h1 className="text-xl font-semibold">Operations</h1>
      <KillSwitchPanel canChange={writeRoles.includes(role)} />
      <ProviderHealthPanel />
      <AiCostPanel />
    </main>
  );
}
