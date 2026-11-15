import Link from 'next/link';
import { requireSession } from '@/lib/require-session';
export default async function SetupPage() {
  const session = await requireSession();
  return (
    <main className="space-y-4 p-6">
      <h1 className="text-xl font-bold">Shop setup</h1>
      <p>
        {session.stores.length
          ? 'Choose an existing shop above to continue.'
          : 'Your account is ready. Shop setup is not available yet.'}
      </p>
      <Link href="/security" className="inline-flex min-h-10 items-center text-action underline">
        Account security
      </Link>
    </main>
  );
}
