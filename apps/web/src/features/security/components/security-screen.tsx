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
    <main className="max-w-3xl space-y-6 p-4 md:p-8">
      <h1 className="text-xl font-bold">Security</h1>
      <p>These settings belong to your account across all shops.</p>
      <nav aria-label="Security sections" className="flex flex-wrap gap-4">
        {sections.map(([value, label]) => (
          <Link
            key={value}
            href={`/security?tab=${value}`}
            aria-current={value === tab ? 'page' : undefined}
            className="inline-flex min-h-10 items-center text-action underline"
          >
            {label}
          </Link>
        ))}
      </nav>
      <SecurityContent tab={tab} before={before} />
    </main>
  );
}
