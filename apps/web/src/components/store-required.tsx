import Link from 'next/link';
export function StoreRequired({ hasMemberships }: { hasMemberships: boolean }) {
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-bold">{hasMemberships ? 'Choose a shop' : 'Set up your shop'}</h1>
      <p>
        {hasMemberships
          ? 'Choose an existing shop above to continue.'
          : 'Your account is ready. Shop setup is the next step.'}
      </p>
      {!hasMemberships ? (
        <Link href="/setup" className="inline-flex min-h-10 items-center text-action underline">
          Continue setup
        </Link>
      ) : null}
    </div>
  );
}
