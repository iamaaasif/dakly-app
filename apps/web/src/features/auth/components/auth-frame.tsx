import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@dakly/ui/card';
export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <Link href="/sign-in" className="inline-flex min-h-10 items-center text-lg font-bold">
        Dakly
      </Link>
      <Card>
        <h1 tabIndex={-1} className="mb-6 text-xl font-bold">
          {title}
        </h1>
        {children}
      </Card>
    </main>
  );
}
