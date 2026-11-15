'use client';
import Link from 'next/link';

import { useSessionContext } from '@/lib/session-context';

export function Dashboard() {
  const { data } = useSessionContext();
  if (!data?.currentStore) return null;
  return (
    <main className="space-y-6 p-4 md:p-8">
      <h1 className="text-xl font-bold">Dashboard</h1>
      <p>
        Welcome, {data.user.name}. You are working in {data.currentStore.name}.
      </p>
      <nav aria-label="Your shop" className="flex flex-wrap gap-4">
        {data.currentStore.canViewCustomers ? (
          <Link
            href="/customers"
            className="inline-flex min-h-10 items-center text-action underline"
          >
            Customers
          </Link>
        ) : null}
        <Link href="/security" className="inline-flex min-h-10 items-center text-action underline">
          Account security
        </Link>
        {data.currentStore.canApproveSupport ? (
          <Link
            href="/support-access"
            className="inline-flex min-h-10 items-center text-action underline"
          >
            Support access
          </Link>
        ) : null}
      </nav>
    </main>
  );
}
