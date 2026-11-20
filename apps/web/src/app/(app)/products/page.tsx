import Link from 'next/link';

import { productScreenQuerySchema } from '@dakly/contracts/products';

import { ProductsScreen } from '@/features/products/components/products-screen';
import { requireSession } from '@/lib/require-session';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  if (!session.currentStore?.canViewProducts)
    return (
      <p role="status" className="p-6">
        You do not have Products access in this shop.
      </p>
    );
  const parsed = productScreenQuerySchema.safeParse(await searchParams);
  if (!parsed.success)
    return (
      <p role="alert" className="p-6">
        This products page address is invalid. <Link href="/products">Open all products</Link>.
      </p>
    );
  const { adjust, create, import: importing, product, productTab, ...query } = parsed.data;
  return (
    <ProductsScreen
      query={query}
      adjust={adjust}
      create={create}
      importing={importing}
      productId={product}
      productTab={productTab}
    />
  );
}
