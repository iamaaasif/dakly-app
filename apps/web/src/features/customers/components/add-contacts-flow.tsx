'use client';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';

import { AddCustomersChooser } from './add-customers-chooser';
import { ImportCustomersDialog } from './import-customers-dialog';
import { NewCustomerForm } from './new-customer-form';
import { SessionDialog as Dialog } from '@/components/session-dialog';
import { useSessionContext } from '@/lib/session-context';

// The Contacts page mounts this; the Customers page only lists people who already ordered.
export function AddContactsFlow() {
  const [adding, setAdding] = useState<'choose' | 'manual' | 'import' | null>(null);
  const [added, setAdded] = useState(false);
  const { data: context } = useSessionContext();
  if (!context?.currentStore?.canCreateCustomer) return null;
  return (
    <>
      <Button onClick={() => setAdding('choose')} className="gap-2">
        <Plus aria-hidden="true" size={16} strokeWidth={1.75} /> Add customers
      </Button>
      {added ? (
        <p role="status">
          <Badge variant="success">Customer added</Badge>
        </p>
      ) : null}
      {adding === 'choose' ? (
        <AddCustomersChooser onChoose={setAdding} onClose={() => setAdding(null)} />
      ) : null}
      {adding === 'manual' ? (
        <Dialog open title="Add customer" onClose={() => setAdding(null)}>
          <NewCustomerForm
            onAdded={() => {
              setAdding(null);
              setAdded(true);
            }}
            onCancel={() => setAdding(null)}
          />
        </Dialog>
      ) : null}
      {adding === 'import' ? <ImportCustomersDialog onClose={() => setAdding(null)} /> : null}
    </>
  );
}
