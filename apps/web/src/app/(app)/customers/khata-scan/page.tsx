import { KhataScanScreen } from '@/features/khata-scans/components/khata-scan-screen';
import { requireSession } from '@/lib/require-session';

export default async function KhataScanPage() {
  const session = await requireSession();
  if (!session.currentStore?.canCreateCustomer)
    return (
      <p role="status" className="p-6">
        You need permission to edit customers to scan a khata.
      </p>
    );
  return <KhataScanScreen />;
}
