'use client';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { KhataPagesStep } from './khata-pages-step';
import { KhataScanStage } from './khata-scan-stage';
import { KhataStartStep } from './khata-start-step';

type Stage = { kind: 'start' } | { kind: 'pick' } | { kind: 'scan'; pageIds: string[] };

export function KhataScanScreen() {
  const [stage, setStage] = useState<Stage>({ kind: 'start' });
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
      {stage.kind === 'start' ? (
        <KhataStartStep onStart={() => setStage({ kind: 'pick' })} />
      ) : null}
      {stage.kind === 'pick' ? (
        <KhataPagesStep
          onBack={() => setStage({ kind: 'start' })}
          onRead={(pageIds) => setStage({ kind: 'scan', pageIds })}
        />
      ) : null}
      {stage.kind === 'scan' ? (
        <KhataScanStage
          key={stage.pageIds.join()}
          pageIds={stage.pageIds}
          onScanMore={() => setStage({ kind: 'pick' })}
        />
      ) : null}
    </main>
  );
}
