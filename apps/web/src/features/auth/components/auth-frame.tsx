import { ChevronLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Card } from '@dakly/ui/card';

import { AuthBrandPanel } from './auth-brand-panel';

type AuthFrameProps = {
  title: string;
  subtitle?: string;
  // Switch link under the form, such as "New to Dakly? Create an account".
  aside?: ReactNode;
  // A Back button in the top bar, for steps that can return to the one before.
  onBack?: () => void;
  // Position in a multi-step flow, drawn as bars above the title.
  step?: { current: number; total: number };
  // Inside another page, such as an invitation, there is no split screen.
  embedded?: boolean;
  children: ReactNode;
};
export function AuthFrame({
  title,
  subtitle,
  aside,
  step,
  onBack,
  embedded,
  children,
}: AuthFrameProps) {
  const heading = (
    <div className="mb-5.5 space-y-2.5">
      {step ? <StepBars {...step} /> : null}
      <h1 tabIndex={-1} className="text-title font-bold tracking-tight text-balance">
        {title}
      </h1>
      {subtitle ? <p className="text-field text-text-muted">{subtitle}</p> : null}
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
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[min(46%,45rem)_1fr]">
      <AuthBrandPanel />
      <main className="flex flex-col px-4 py-6 sm:px-8">
        <AuthTopBar onBack={onBack} />
        <div className="mx-auto flex w-full max-w-110 flex-1 flex-col justify-center py-8">
          {heading}
          {children}
          {aside ? (
            <div className="mt-6 space-y-4 border-t border-border pt-4 text-center text-text-muted">
              {aside}
            </div>
          ) : null}
        </div>
        <p className="text-center text-sm text-text-muted lg:hidden">
          Need help? +880 9610-325591 · English ·{' '}
          <span lang="bn" title="Bangla is coming soon">
            বাংলা
          </span>
        </p>
      </main>
    </div>
  );
}

function StepBars({ current, total }: { current: number; total: number }) {
  return (
    <div className="space-y-2.5">
      <p className="text-sm font-semibold text-text-muted">
        Step {current} of {total}
      </p>
      <div aria-hidden="true" className="flex gap-1.5">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={`h-1 flex-1 rounded-full ${index < current ? 'bg-primary' : 'bg-border'}`}
          />
        ))}
      </div>
    </div>
  );
}

function AuthTopBar({ onBack }: { onBack?: () => void }) {
  return (
    <div className="flex min-h-9.5 items-center gap-3">
      <Link href="/sign-in" className="flex items-center gap-2 text-md font-bold lg:hidden">
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-lg bg-primary"
        >
          <Image src="/dakly-mark.png" alt="" width={230} height={290} className="h-auto w-4" />
        </span>
        <span>
          Dakly <span className="text-action">AI</span>
        </span>
      </Link>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="-ml-3 inline-flex min-h-10 items-center gap-1.5 rounded-control px-3 text-base font-semibold text-text hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <ChevronLeft aria-hidden="true" size={18} />
          Back
        </button>
      ) : null}
    </div>
  );
}
