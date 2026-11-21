import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@dakly/ui/cn';

export function AuthLink({
  href,
  onNavigate,
  children,
  current,
  className,
}: {
  href: string;
  onNavigate?: () => void;
  children: ReactNode;
  current?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-10 items-center font-semibold text-action underline',
        className,
      )}
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
