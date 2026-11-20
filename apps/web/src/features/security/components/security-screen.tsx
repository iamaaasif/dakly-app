'use client';
import Link from 'next/link';

import { SecurityContent } from './security-content';

const sections = [
  ['profile', 'My profile'],
  ['devices', 'Devices'],
  ['two-step', 'Two-step verification'],
  ['history', 'Security history'],
] as const;

export function SecurityScreen({ tab, before }: { tab: string; before?: string }) {
  return (
    <main className="max-w-4xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">Security</h1>
        <p className="mt-1 text-sm text-text-muted">
          These settings belong to your account across all shops.
        </p>
      </div>
      <nav aria-label="Security sections" className="flex gap-6 border-b border-border">
        {sections.map(([value, label]) => (
          <Link
            key={value}
            href={`/security?tab=${value}`}
            aria-current={value === tab ? 'page' : undefined}
            className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-medium ${
              value === tab
                ? 'border-action font-semibold text-text'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <SecurityContent tab={tab} before={before} />
    </main>
  );
}
