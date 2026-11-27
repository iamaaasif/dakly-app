import { Printer } from 'lucide-react';
import Link from 'next/link';

import { maxOrderShippingLabels } from '@dakly/contracts/order-shipping-labels';
import { Button, buttonVariants } from '@dakly/ui/button';

import { useSessionContext } from '@/lib/session-context';

export function OrderLabelSelection({
  orderIds,
  onClear,
}: {
  orderIds: string[];
  onClear: () => void;
}) {
  const { data } = useSessionContext();
  const count = orderIds.length;
  if (!data?.currentStore?.canPrintShippingLabels || count === 0) return null;
  const search = new URLSearchParams({ orderIds: orderIds.join(',') });
  return (
    <section
      aria-label="Orders selected for shipping labels"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3"
    >
      <p role="status" className="mr-auto text-sm font-medium">
        {count} of {maxOrderShippingLabels} orders selected
      </p>
      <Button variant="secondary" onClick={onClear}>
        Clear selection
      </Button>
      <Link
        href={`/orders/shipping-labels/print?${search}#print`}
        target="_blank"
        rel="noopener noreferrer"
        prefetch={false}
        className={buttonVariants()}
      >
        <Printer size={16} aria-hidden="true" />
        Print shipping labels
        <span className="sr-only"> (opens in a new tab)</span>
      </Link>
    </section>
  );
}
