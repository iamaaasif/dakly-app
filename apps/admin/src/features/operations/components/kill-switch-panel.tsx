'use client';
import {
  killSwitchFeatures,
  type KillSwitchFeature,
  type KillSwitchListResponse,
} from '@dakly/contracts/kill-switches';
import { Badge } from '@dakly/ui/badge';
import { Card } from '@dakly/ui/card';
import { Skeleton } from '@dakly/ui/skeleton';

import { useKillSwitches } from '../api/operations';
import { featureNames } from './feature-names';
import { KillSwitchForm } from './kill-switch-form';
import { ShopPauseForm } from './shop-pause-form';
import { formatDate } from '@/lib/format-date';

export function KillSwitchPanel({ canChange }: { canChange: boolean }) {
  const switches = useKillSwitches();
  if (switches.isPending) return <Skeleton className="h-40 w-full" />;
  if (switches.error) return <p role="alert">{switches.error.message}</p>;
  const active = switches.data.switches;
  const shopPauses = active.filter((row) => row.storeId);
  return (
    <section className="space-y-4" aria-labelledby="switches-heading">
      <h2 id="switches-heading" className="text-lg font-semibold">
        Kill switches
      </h2>
      <p className="text-muted">
        A pause keeps queued work and stops new work within a minute. Each change needs a reason and
        is written to the staff audit log first.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {killSwitchFeatures.map((feature) => (
          <GlobalSwitchCard
            key={feature}
            feature={feature}
            row={active.find((row) => row.feature === feature && !row.storeId)}
            canChange={canChange}
          />
        ))}
      </div>
      <h3 className="font-semibold">Paused for one shop</h3>
      {shopPauses.length === 0 ? <p>No shop is paused on its own.</p> : null}
      {shopPauses.map((row) => (
        <ShopPauseCard key={row.id} row={row} canChange={canChange} />
      ))}
      {canChange ? <ShopPauseForm /> : null}
    </section>
  );
}

type Row = KillSwitchListResponse['switches'][number];

function GlobalSwitchCard({
  feature,
  row,
  canChange,
}: {
  feature: KillSwitchFeature;
  row: Row | undefined;
  canChange: boolean;
}) {
  return (
    <Card className="space-y-3 break-words">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{featureNames[feature]}</h3>
        <Badge variant={row ? 'danger' : 'success'}>
          {row ? 'Paused for all shops' : 'Running'}
        </Badge>
      </div>
      {row ? (
        <p>
          {row.reason} · {formatDate(row.pausedAt)}
        </p>
      ) : null}
      {canChange ? (
        <KillSwitchForm
          key={row ? 'paused' : 'running'}
          feature={feature}
          storeId={null}
          paused={Boolean(row)}
          label={row ? 'Resume for all shops' : 'Pause for all shops'}
        />
      ) : null}
    </Card>
  );
}

function ShopPauseCard({ row, canChange }: { row: Row; canChange: boolean }) {
  return (
    <Card className="space-y-3 break-words">
      <p className="font-medium">
        {featureNames[row.feature]} · shop <span className="break-all">{row.storeId}</span>
      </p>
      <p>
        {row.reason} · {formatDate(row.pausedAt)}
      </p>
      {canChange ? (
        <KillSwitchForm
          feature={row.feature}
          storeId={row.storeId}
          paused
          label="Resume for this shop"
        />
      ) : null}
    </Card>
  );
}
