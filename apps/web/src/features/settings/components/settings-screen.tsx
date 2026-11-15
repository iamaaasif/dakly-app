'use client';
import Link from 'next/link';

import { SettingsContent } from './settings-content';
import { StorePage } from '@/components/store-page';

export function SettingsScreen({ tab }: { tab: 'store' | 'extensions' }) {
  return (
    <StorePage permission="canViewStoreSettings">
      <main className="max-w-4xl space-y-6 p-4 md:p-8">
        <h1 className="text-xl font-bold">Store settings</h1>
        <nav aria-label="Settings sections" className="flex flex-wrap gap-4">
          {(['store', 'extensions'] as const).map((item) => (
            <Link
              key={item}
              href={`/settings?tab=${item}`}
              aria-current={tab === item ? 'page' : undefined}
              className="inline-flex min-h-10 items-center text-action underline"
            >
              {item === 'store' ? 'Store information' : 'Extensions'}
            </Link>
          ))}
        </nav>
        <SettingsContent tab={tab} />
      </main>
    </StorePage>
  );
}
