'use client';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

import { KhataStartStep } from './khata-start-step';

export function KhataScanScreen() {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:p-8">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1 self-start font-semibold text-text-muted hover:text-text"
      >
        <ChevronLeft aria-hidden="true" size={16} strokeWidth={1.75} />
        Customers
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Khata Scanner</h1>
        <p className="text-text-muted">
          Turn your handwritten sales records into digital customer data.
        </p>
      </div>
      <KhataStartStep />
    </main>
  );
}
