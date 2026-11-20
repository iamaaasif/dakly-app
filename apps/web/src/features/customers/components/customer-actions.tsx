import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ContactResponse } from '@dakly/contracts/contacts';
import { Button } from '@dakly/ui/button';

import { useDeleteCustomer } from '../api/delete-customer';
import { CustomerEditForm } from './customer-edit-form';
import { SessionDialog as Dialog } from '@/components/session-dialog';

type CustomerActionsProps = { customer: ContactResponse };

export function CustomerActions({ customer }: CustomerActionsProps) {
  const [action, setAction] = useState<'edit' | 'delete' | null>(null);
  const router = useRouter();
  const remove = useDeleteCustomer(customer.id);
  const name = customer.name ?? 'this customer';
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => setAction('edit')}>
        Edit customer
      </Button>
      <Button variant="secondary" onClick={() => setAction('delete')}>
        Delete customer
      </Button>
      {action === 'edit' ? (
        <Dialog open title={`Edit ${name}`} onClose={() => setAction(null)}>
          <CustomerEditForm customer={customer} onDone={() => setAction(null)} />
        </Dialog>
      ) : null}
      {action === 'delete' ? (
        <Dialog open title={`Delete ${name}?`} onClose={() => setAction(null)}>
          <p className="mb-4">
            They leave the customer list and their profile closes. Their phone number can then be
            saved on another customer.
          </p>
          {remove.error ? (
            <p role="alert" className="mb-4 text-danger">
              {remove.error.message}
            </p>
          ) : null}
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => remove.mutate(undefined, { onSuccess: () => router.push('/customers') })}
          >
            Delete customer
          </Button>
        </Dialog>
      ) : null}
    </div>
  );
}
