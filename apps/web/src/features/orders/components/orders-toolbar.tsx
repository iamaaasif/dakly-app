import { orderSources } from '@dakly/contracts/orders';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { ordersSearch } from '../api/orders';
import { orderSourceLabels } from '../order-labels';
import type { OrdersNavigationQuery } from '../orders-url';
import { OrderFilters } from './order-filters';
import { OrderSearchField } from './order-search-field';
import { useUrlRouter } from '@/lib/use-url-query';

const allSources = 'all';

type OrdersToolbarProps = { query: OrdersNavigationQuery };

export function OrdersToolbar({ query }: OrdersToolbarProps) {
  const router = useUrlRouter();
  const go = (change: Partial<OrdersNavigationQuery>, mode: 'push' | 'replace' = 'push') =>
    router[mode](`/orders?${ordersSearch({ ...query, ...change, cursor: undefined })}`);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 sm:p-4">
      <OrderSearchField search={query.search} onSearch={go} />
      {query.tab === 'inquiries' ? null : (
        <>
          <Select
            value={query.source ?? allSources}
            onValueChange={(value) =>
              go({ source: orderSources.find((source) => source === value) })
            }
          >
            <SelectTrigger aria-label="Source" className="w-auto min-w-36 bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allSources}>All sources</SelectItem>
              {orderSources.map((source) => (
                <SelectItem key={source} value={source}>
                  {orderSourceLabels[source]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <OrderFilters query={query} />
        </>
      )}
    </div>
  );
}
