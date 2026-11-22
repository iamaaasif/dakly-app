import Link from 'next/link';
import { z } from 'zod';

import { EditProductPage } from '@/features/products/components/product-page';
import { requireSession } from '@/lib/require-session';

export default async function ProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const session = await requireSession();
  if (!session.currentStore?.canViewProducts)
    return (
      <p role="status" className="p-6">
        You do not have Products access in this shop.
      </p>
    );
  const parsed = z.uuid().safeParse((await params).productId);
  if (!parsed.success)
    return (
      <p role="alert" className="p-6">
        This product address is invalid. <Link href="/products">Open all products</Link>.
      </p>
    );
  return <EditProductPage productId={parsed.data} />;
}
