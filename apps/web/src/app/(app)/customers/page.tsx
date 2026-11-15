import { NewCustomerForm } from '@/features/customers/components/new-customer-form';
import { StorePage } from '@/components/store-page';
import { requireSession } from '@/lib/require-session';
export default async function CustomersPage() {
  await requireSession();
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
