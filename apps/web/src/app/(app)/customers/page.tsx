import { StorePage } from '@/components/store-page';
import { NewCustomerForm } from '@/features/customers/components/new-customer-form';
import { requireSession } from '@/lib/require-session';

export default async function CustomersPage() {
  const session = await requireSession();
  if (!session.currentStore?.canViewCustomers)
    return (
      <p role="status" className="p-6">
        You do not have Customers access in this shop.
      </p>
    );
  return (
    <StorePage permission="canViewCustomers">
      <main className="mx-auto max-w-2xl space-y-6 p-6 md:p-8">
        <h1 className="text-xl font-bold">Customers</h1>
        <StorePage permission="canCreateCustomer">
          <NewCustomerForm />
        </StorePage>
      </main>
    </StorePage>
  );
}
