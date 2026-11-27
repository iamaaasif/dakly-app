'use client';
import { AddContactsChooser } from './add-contacts-chooser';
import { ContactForm } from './contact-form';
import { ImportCustomersDialog } from './import-customers-dialog';
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
        <AddContactsChooser onChoose={onAdding} onClose={() => onAdding(null)} />
      ) : null}
      {adding === 'manual' ? (
        <Dialog open title="Add contact" className="max-w-2xl" onClose={() => onAdding(null)}>
          <ContactForm
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
