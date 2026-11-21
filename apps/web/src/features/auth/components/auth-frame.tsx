import Link from 'next/link';
import type { ReactNode } from 'react';

import { Card } from '@dakly/ui/card';

import { AuthBrandPanel } from './auth-brand-panel';

type AuthFrameProps = {
  title: string;
  subtitle?: string;
  // Link at the top right of the wide layout, such as "New to Dakly? Create an account".
  aside?: ReactNode;
  // Inside another page, such as an invitation, there is no split screen.
  embedded?: boolean;
  children: ReactNode;
};
export function AuthFrame({ title, subtitle, aside, embedded, children }: AuthFrameProps) {
  const heading = (
    <div className="mb-6 space-y-1">
      <h1 tabIndex={-1} className="text-xl font-bold">
        {title}
      </h1>
      {subtitle ? <p className="text-text-muted">{subtitle}</p> : null}
    </div>
  );
  if (embedded)
    return (
      <main className="mx-auto max-w-lg space-y-6 px-4 py-8">
        <Card>
          {heading}
          {children}
        </Card>
      </main>
    );
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[5fr_8fr]">
      <AuthBrandPanel />
      <main className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/sign-in" className="text-md font-bold lg:invisible">
            Dakly <span className="text-action">AI</span>
          </Link>
          {aside}
        </div>
        <div className="mx-auto flex w-full max-w-105 flex-1 flex-col justify-center py-8">
          {heading}
          {children}
        </div>
        <p className="text-center text-sm text-text-muted">
          Need help? +880 9610-325591 · English ·{' '}
          <span lang="bn" title="Bangla is coming soon">
            বাংলা
          </span>
        </p>
      </main>
    </div>
  );
}
