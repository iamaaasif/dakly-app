'use client';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { KhataPagesStep } from './khata-pages-step';
import { KhataScanStage } from './khata-scan-stage';
import { KhataStartStep } from './khata-start-step';

const khataScanPath = '/customers/khata-scan';

type KhataScanScreenProps = { pageIds: string[]; activePage: number };

export function KhataScanScreen({ pageIds, activePage }: KhataScanScreenProps) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const scanning = pageIds.length > 0;
  const showPages = (ids: string[], tab = 1) =>
    `${khataScanPath}?${new URLSearchParams({ pages: ids.join(','), page: String(tab) })}`;
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
      {!scanning && !picking ? <KhataStartStep onStart={() => setPicking(true)} /> : null}
      {!scanning && picking ? (
        <KhataPagesStep
          onBack={() => setPicking(false)}
          onRead={(ids) => router.push(showPages(ids))}
        />
      ) : null}
      {scanning ? (
        <KhataScanStage
          key={pageIds.join()}
          pageIds={pageIds}
          activePage={activePage}
          onActivePage={(tab) => router.replace(showPages(pageIds, tab))}
          onScanMore={() => {
            setPicking(true);
            router.push(khataScanPath);
          }}
        />
      ) : null}
    </main>
  );
}
