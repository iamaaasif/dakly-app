'use client';
import { Send } from 'lucide-react';

import type { DueListCustomerResponse } from '@dakly/contracts/due-book';
import { Button } from '@dakly/ui/button';
import { useToast } from '@dakly/ui/toast';

import { useRemindCustomer } from '../api/remind';
import { SessionDialog } from '@/components/session-dialog';

type RemindDialogProps = { customer: DueListCustomerResponse; onClose: () => void };

export function RemindDialog({ customer, onClose }: RemindDialogProps) {
  const remind = useRemindCustomer(customer.contactId);
  const showToast = useToast();
  const name = customer.name ?? customer.phone ?? 'customer';
  return (
    <SessionDialog open title={`Remind ${name}`} onClose={onClose} closeDisabled={remind.isPending}>
      <div className="space-y-4">
        <p>
          Dakly sends one polite reminder in Bangla by SMS, using your SMS credits. The wording is
          fixed, so it never has a threat or a late fee.
        </p>
        <p className="text-text-muted">
          A customer gets at most one reminder every 7 days, between 9 am and 8 pm.
        </p>
        {remind.error && (
          <p role="alert" className="text-danger">
            {remind.error.message}
          </p>
        )}
        <div className="flex justify-end border-t border-border pt-4">
          <Button
            loading={remind.isPending}
            onClick={() =>
              remind.mutate(undefined, {
                onSuccess: () => {
                  showToast(`Reminder sent to ${name}.`);
                  onClose();
                },
              })
            }
          >
            <Send aria-hidden="true" size={16} strokeWidth={1.75} /> Send reminder
          </Button>
        </div>
      </div>
    </SessionDialog>
  );
}
