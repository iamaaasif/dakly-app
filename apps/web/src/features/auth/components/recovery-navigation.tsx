import Link from 'next/link';
export function RecoveryNavigation({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav aria-label="Recovery options" className="mt-6 flex flex-wrap gap-4">
      <Link
        onClick={onNavigate}
        href="/security/recovery"
        className="inline-flex min-h-10 items-center text-action underline"
      >
        Start recovery
      </Link>
      <Link
        onClick={onNavigate}
        href="/security/recovery?view=complete"
        className="inline-flex min-h-10 items-center text-action underline"
      >
        Complete a recovery
      </Link>
      <Link
        onClick={onNavigate}
        href="/sign-in"
        className="inline-flex min-h-10 items-center text-action underline"
      >
        Back to sign in
      </Link>
    </nav>
  );
}
