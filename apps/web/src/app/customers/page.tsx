import { NewCustomerForm } from '@/features/customers/components/new-customer-form';

export default function CustomersPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6 md:p-8">
      <h1 className="text-xl font-bold">Customers</h1>
      <NewCustomerForm />
    </main>
  );
}
