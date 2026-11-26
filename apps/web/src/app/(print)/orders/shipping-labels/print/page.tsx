'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { shippingLabelQuerySchema } from '@dakly/contracts/order-shipping-labels';

import { OrderShippingLabelsScreen } from '@/features/orders/components/order-shipping-labels-screen';

function ShippingLabelsFromUrl() {
  const search = useSearchParams();
  const batch = shippingLabelQuerySchema.safeParse(Object.fromEntries(search));
  if (batch.success) return <OrderShippingLabelsScreen orderIds={batch.data.orderIds} />;
  return (
    <p role="alert" className="p-6">
      This label selection is empty or invalid.{' '}
      <Link href="/orders" className="inline-flex min-h-10 items-center text-action underline">
        Choose orders
      </Link>
      .
    </p>
  );
}

export default function OrderShippingLabelsPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6">
          Loading shipping labels…
        </p>
      }
    >
      <ShippingLabelsFromUrl />
    </Suspense>
  );
}
