import { NewCustomerForm } from '@/features/customers/components/new-customer-form';

// Routes stay thin: check access (once auth exists), then render one feature screen.
export default function CustomersPage() {
  return (
    <main>
      <h1>Customers</h1>
      <NewCustomerForm />
    </main>
  );
}
