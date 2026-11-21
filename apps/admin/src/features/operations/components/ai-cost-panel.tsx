'use client';
import { useRouter, useSearchParams } from 'next/navigation';

import type { AiCostShop } from '@dakly/contracts/ops-reports';
import { Badge } from '@dakly/ui/badge';
import { Input } from '@dakly/ui/input';
import { Skeleton } from '@dakly/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import { useAiCost } from '../api/operations';
import { formatMicroUsd } from '@/lib/format-micro-usd';

export function AiCostPanel() {
  const params = useSearchParams();
  const router = useRouter();
  const day = params.get('day') ?? '';
  const cost = useAiCost(day);
  return (
    <section className="space-y-3" aria-labelledby="cost-heading">
      <h2 id="cost-heading" className="text-lg font-semibold">
        AI cost per shop
      </h2>
      <label htmlFor="cost-day">Day (Asia/Dhaka, today when empty)</label>
      <Input
        id="cost-day"
        type="date"
        value={day}
        onChange={(event) =>
          router.replace(event.target.value ? `?day=${event.target.value}` : '?')
        }
      />
      {cost.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {cost.error ? <p role="alert">{cost.error.message}</p> : null}
      {cost.data ? (
        <>
          <p>
            {cost.data.day}: {formatMicroUsd(cost.data.totalMicroUsd)} across the top{' '}
            {cost.data.shops.length} shops.{' '}
            {cost.data.ceilingMicroUsd === null
              ? 'No daily ceiling is set.'
              : `Daily ceiling per shop: ${formatMicroUsd(cost.data.ceilingMicroUsd)}.`}
          </p>
          {cost.data.shops.length === 0 ? <p>No AI cost on this day.</p> : null}
          {cost.data.shops.length > 0 ? <AiCostTable shops={cost.data.shops} /> : null}
        </>
      ) : null}
    </section>
  );
}

function AiCostTable({ shops }: { shops: AiCostShop[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Shop</TableHead>
          <TableHead>Runs</TableHead>
          <TableHead>Failed</TableHead>
          <TableHead>Cost</TableHead>
          <TableHead>Ceiling</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {shops.map((shop) => (
          <TableRow key={shop.storeId}>
            <TableCell className="break-words">
              {shop.name}
              <span className="text-muted block text-xs break-all">{shop.storeId}</span>
            </TableCell>
            <TableCell>{shop.runs}</TableCell>
            <TableCell>{shop.failedRuns}</TableCell>
            <TableCell>{formatMicroUsd(shop.costMicroUsd)}</TableCell>
            <TableCell>
              {shop.overCeiling ? <Badge variant="danger">Over</Badge> : 'Within'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
