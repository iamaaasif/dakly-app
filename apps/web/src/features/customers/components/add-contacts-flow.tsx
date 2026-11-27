'use client';
import { AddCustomersChooser } from './add-customers-chooser';
import { ImportCustomersDialog } from './import-customers-dialog';
import { NewCustomerForm } from './new-customer-form';
import { SessionDialog as Dialog } from '@/components/session-dialog';

export type AddingContacts = 'choose' | 'manual' | 'import' | null;

type AddContactsDialogsProps = {
  adding: AddingContacts;
  onAdding: (next: AddingContacts) => void;
  onAdded: () => void;
};

// The Contacts page owns which dialog is open, because its header, toolbar and empty state all open one.
export function AddContactsDialogs({ adding, onAdding, onAdded }: AddContactsDialogsProps) {
  return (
    <>
      {adding === 'choose' ? (
        <AddCustomersChooser onChoose={onAdding} onClose={() => onAdding(null)} />
      ) : null}
      {adding === 'manual' ? (
        <Dialog open title="Add customer" onClose={() => onAdding(null)}>
          <NewCustomerForm
            onAdded={() => {
              onAdding(null);
              onAdded();
            }}
            onCancel={() => onAdding(null)}
          />
        </Dialog>
      ) : null}
      {adding === 'import' ? <ImportCustomersDialog onClose={() => onAdding(null)} /> : null}
    </>
  );
}
