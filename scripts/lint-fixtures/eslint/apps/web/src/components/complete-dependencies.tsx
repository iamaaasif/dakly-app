import { useEffect } from 'react';

export function OrderTitle({ orderNumber }: { orderNumber: number }) {
  useEffect(() => {
    document.title = `Order ${orderNumber}`;
  }, [orderNumber]);
  return null;
}
