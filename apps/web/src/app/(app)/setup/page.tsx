import Link from 'next/link';

import { SetupScreen } from '@/features/auth/components/setup-screen';
import { requireSession } from '@/lib/require-session';

export default async function SetupPage() {
  const session = await requireSession();
  if (session.hasMemberships)
    return (
      <main className="space-y-4 p-6">
        <h1 className="text-xl font-bold">Your shops</h1>
        <p>Choose an existing shop above to continue.</p>
        <Link href="/dashboard" className="inline-flex min-h-10 items-center text-action underline">
          Continue to Dashboard
        </Link>
      </main>
    );
  return <SetupScreen />;
}
