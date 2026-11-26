'use client';

import { useParams } from 'next/navigation';

import { OrderInvoiceScreen } from '@/features/orders/components/order-invoice-screen';

export default function OrderInvoicePage() {
  const { orderId } = useParams<{ orderId: string }>();
  return <OrderInvoiceScreen orderId={orderId} />;
}
