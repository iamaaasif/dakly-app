import Link from 'next/link';

import { NewProductPage } from '@/features/products/components/product-page';
import { requireSession } from '@/lib/require-session';

export default async function NewProduct() {
  const session = await requireSession();
  if (!session.currentStore?.canEditProducts)
    return (
      <p role="status" className="p-6">
        You do not have access to add products in this shop. <Link href="/products">Back</Link>.
      </p>
    );
  return <NewProductPage />;
}
