import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ProductsScreen } from '@/features/products/components/products-screen';
import { parseProductsScreen } from '@/features/products/products-url';
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
  const raw = await searchParams;
  // Old bookmarks opened the drawer and the add modal; both are now full pages.
  if (typeof raw.product === 'string') redirect(`/products/${encodeURIComponent(raw.product)}`);
  if (raw.create === '1') redirect('/products/new');
  const screen = parseProductsScreen(raw);
  if (!screen)
    return (
      <p role="alert" className="p-6">
        This products page address is invalid. <Link href="/products">Open all products</Link>.
      </p>
    );
  return <ProductsScreen {...screen} />;
}
