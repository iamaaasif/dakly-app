import Link from 'next/link';
import type { ReactNode } from 'react';
export function AuthLink({
  href,
  onNavigate,
  children,
  current,
}: {
  href: string;
  onNavigate?: () => void;
  children: ReactNode;
  current?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className="inline-flex min-h-10 items-center text-action underline"
      onClick={(event) => {
        if (onNavigate) {
          event.preventDefault();
          onNavigate();
        }
      }}
    >
      {children}
    </Link>
  );
}
