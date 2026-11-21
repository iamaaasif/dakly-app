import Link from 'next/link';

import type { AdminShopRow } from '@dakly/contracts/admin-shops';
import { formatMoney } from '@dakly/contracts/money';
import { Card } from '@dakly/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import { ShopStatus } from './shop-status';
import { formatDate } from '@/lib/format-date';

const lastActive = (shop: AdminShopRow) =>
  shop.lastActiveAt ? formatDate(shop.lastActiveAt) : 'Never';

export function ShopsTable({ rows }: { rows: AdminShopRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {['Shop', 'Owner', 'Plan', 'Status', 'MRR', 'Signed up', 'Last active'].map((title) => (
            <TableHead key={title}>{title}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((shop) => (
          <TableRow key={shop.storeId}>
            <TableCell>
              <Link href={`/shops/${shop.storeId}`} className="text-action underline">
                {shop.name}
              </Link>
            </TableCell>
            <TableCell>
              {shop.ownerName ?? 'No owner'}
              <span className="text-muted block">{shop.ownerPhoneMasked}</span>
            </TableCell>
            <TableCell>{shop.planName ?? 'No plan'}</TableCell>
            <TableCell>
              <ShopStatus status={shop.status} />
            </TableCell>
            <TableCell>{formatMoney(shop.mrrPoisha)}</TableCell>
            <TableCell>{formatDate(shop.createdAt)}</TableCell>
            <TableCell>{lastActive(shop)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ShopCards({ rows }: { rows: AdminShopRow[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((shop) => (
        <li key={shop.storeId}>
          <Card className="space-y-1">
            <Link href={`/shops/${shop.storeId}`} className="font-semibold text-action underline">
              {shop.name}
            </Link>
            <p>
              <ShopStatus status={shop.status} /> {shop.planName ?? 'No plan'} ·{' '}
              {formatMoney(shop.mrrPoisha)}
            </p>
            <p className="text-muted">
              {shop.ownerName ?? 'No owner'} {shop.ownerPhoneMasked}
            </p>
            <p className="text-muted">Last active: {lastActive(shop)}</p>
          </Card>
        </li>
      ))}
    </ul>
  );
}
