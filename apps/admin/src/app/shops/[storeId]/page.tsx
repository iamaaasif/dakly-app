import { ShopDetailScreen } from '@/features/shops/components/shop-detail-screen';
import { requireStaff } from '@/lib/require-staff';

export default async function Page({ params }: { params: Promise<{ storeId: string }> }) {
  await requireStaff();
  const { storeId } = await params;
  return <ShopDetailScreen storeId={storeId} />;
}
