'use client';
import { formatDateTime } from '@/lib/format-date';
import { useSupportSession } from '../api/support';
import { SupportCustomers } from './support-customers';
export function SupportSession() {
  const session = useSupportSession();
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <h1 className="text-xl font-semibold">Support session</h1>
      {session.isPending ? <p role="status">Checking support access…</p> : null}
      {session.error ? (
        <p role="alert">
          Access ended by the Owner, expired, or your staff session ended. Return to the staff app
          to continue.
        </p>
      ) : null}
      {session.data && !session.error ? (
        <>
          <section
            role="status"
            aria-label="Active Dakly support access"
            className="space-y-2 rounded-md bg-danger p-4 text-on-primary"
          >
            <p className="font-semibold">
              {session.data.isBreakGlass ? 'Dakly break-glass access' : 'Dakly support'} (
              {session.data.staffName})
            </p>
            {session.data.isBreakGlass ? (
              <p>Emergency read-only access. No Owner approval was requested.</p>
            ) : null}
            <p>{session.data.storeName}</p>
            <p>{session.data.access === 'write' ? 'Read and write' : 'Read only'} · Customers</p>
            <p>Access expires {formatDateTime(session.data.expiresAt!)}</p>
            <p>The Owner can end this session at any time.</p>
          </section>
          <SupportCustomers
            key={session.data.contextTag}
            contextTag={session.data.contextTag}
            writable={session.data.access === 'write'}
          />
        </>
      ) : null}
    </main>
  );
}
