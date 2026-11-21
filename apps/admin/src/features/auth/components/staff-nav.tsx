import Link from 'next/link';

import type { StaffIdentity } from '@dakly/contracts/staff-auth';

export function StaffNav({ role }: { role: StaffIdentity['role'] }) {
  return (
    <nav className="flex flex-wrap gap-4">
      {['support', 'super_admin'].includes(role) ? (
        <Link href="/account-recovery" className="text-action underline">
          Recover shop account
        </Link>
      ) : null}
      <Link href="/shops" className="text-action underline">
        Shops
      </Link>
      <Link href="/support" className="text-action underline">
        Support access
      </Link>
      {['super_admin', 'ops', 'analyst'].includes(role) ? (
        <Link href="/operations" className="text-action underline">
          Operations
        </Link>
      ) : null}
      {['super_admin', 'finance', 'analyst'].includes(role) ? (
        <Link href="/plans" className="text-action underline">
          Plans and prices
        </Link>
      ) : null}
      {role === 'super_admin' ? (
        <Link href="/audit" className="text-action underline">
          Staff audit history
        </Link>
      ) : null}
    </nav>
  );
}
