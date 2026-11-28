import { useState } from 'react';

import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { findFilter, setFilter } from '../workflow-trigger-filters';
import { DigitsInput } from '@/components/digits-input';

type Operator = 'at_least' | 'at_most';
type Filter = AutomationGraph['trigger']['filters'][number];
type FormProps = { graph: AutomationGraph; onChange: (graph: AutomationGraph) => void };

type RowProps = {
  label: string;
  hint: string;
  unit: string;
  // The number as typed: whole taka or a count, not poisha.
  current: { operator: Operator; value: number } | undefined;
  onChange: (next: { operator: Operator; value: number } | null) => void;
};

// With nothing typed the filter is off, so the operator is only remembered until a number is.
function TotalRow({ label, hint, unit, current, onChange }: RowProps) {
  const [operator, setOperator] = useState<Operator>(current?.operator ?? 'at_least');
  const id = `filter-${label.replaceAll(' ', '-').toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="grid grid-cols-[8rem_1fr] gap-2">
        <Select
          value={operator}
          onValueChange={(next) => {
            setOperator(next as Operator);
            if (current) onChange({ ...current, operator: next as Operator });
          }}
        >
          <SelectTrigger aria-label={`${label}: at least or at most`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="at_least">at least</SelectItem>
            <SelectItem value="at_most">at most</SelectItem>
          </SelectContent>
        </Select>
        <DigitsInput
          id={id}
          value={current?.value}
          placeholder={unit}
          onChange={(value) => onChange(value === null ? null : { operator, value })}
        />
      </div>
      <p className="text-sm text-text-muted">{hint}</p>
    </div>
  );
}

function moneyRow(
  field: 'order_total' | 'customer_spend',
  graph: AutomationGraph,
): RowProps['current'] {
  const filter = findFilter(graph, field);
  return filter && { operator: filter.operator, value: Math.floor(filter.amountPoisha / 100) };
}

function withMoney(field: 'order_total' | 'customer_spend', next: RowProps['current'] | null) {
  return next && next.value > 0
    ? ({ field, operator: next.operator, amountPoisha: next.value * 100 } as Filter)
    : null;
}

// The totals an order trigger can look at: this order, and everything the customer has bought.
export function OrderTotalFilters({ graph, onChange }: FormProps) {
  const orders = findFilter(graph, 'customer_orders');
  return (
    <>
      <p className="text-sm text-text-muted">
        Leave a box empty to allow any amount. Spent counts delivered and paid orders only.
      </p>
      <TotalRow
        label="Order total"
        unit="Taka"
        hint="Only orders worth this much, for example at least 2000."
        current={moneyRow('order_total', graph)}
        onChange={(next) =>
          onChange(setFilter(graph, 'order_total', withMoney('order_total', next)))
        }
      />
      <TotalRow
        label="Customer total spent"
        unit="Taka"
        hint="Everything this customer has spent so far, for example at least 10000 to find your best customers."
        current={moneyRow('customer_spend', graph)}
        onChange={(next) =>
          onChange(setFilter(graph, 'customer_spend', withMoney('customer_spend', next)))
        }
      />
      <TotalRow
        label="Customer orders"
        unit="Orders"
        hint="How many orders this customer has placed, counting this one. At most 1 finds first-time buyers."
        current={orders && { operator: orders.operator, value: orders.count }}
        onChange={(next) =>
          onChange(
            setFilter(
              graph,
              'customer_orders',
              next
                ? { field: 'customer_orders', operator: next.operator, count: next.value }
                : null,
            ),
          )
        }
      />
    </>
  );
}
