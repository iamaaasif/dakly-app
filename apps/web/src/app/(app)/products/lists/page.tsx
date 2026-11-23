import { ProductListsScreen } from '@/features/products/components/product-lists-screen';
import { requireSession } from '@/lib/require-session';

export default async function ProductListsPage() {
  const session = await requireSession();
  if (!session.currentStore?.canViewProducts)
    return (
      <p role="status" className="p-6">
        You do not have Products access in this shop.
      </p>
    );
  return <ProductListsScreen />;
}
