'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';

import { useLeaveGuard } from '../use-leave-guard';
import { clearProductDraft, readProductDraft, useProductDraft } from '../use-product-draft';
import { SessionDialog } from '@/components/session-dialog';

type ProductFormSafetyProps = {
  formRef: RefObject<HTMLFormElement | null>;
  // A new product with nothing filled in by a quick add, a copy or the assistant.
  canRestoreDraft: boolean;
  readOnly?: boolean;
};

// Keeps typing from being lost: a draft in this tab, a question before leaving, and Ctrl or Cmd + S.
export function ProductFormSafety({ formRef, canRestoreDraft, readOnly }: ProductFormSafetyProps) {
  const form = useFormContext<ProductFormValues>();
  const [restored, setRestored] = useState(false);
  useProductDraft(form.watch, canRestoreDraft && !readOnly);
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    const draft = canRestoreDraft ? readProductDraft() : null;
    if (!draft) return;
    form.reset({ ...form.getValues(), ...draft });
    setRestored(true);
  }, [canRestoreDraft, form]);
  const guard = useLeaveGuard((form.formState.isDirty || restored) && !readOnly);
  useSaveShortcuts(formRef);
  return (
    <>
      {restored ? (
        <div className="flex flex-wrap items-center gap-3 px-4 pt-3 text-sm text-text md:px-8">
          <p role="status">Restored what you had typed before.</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              clearProductDraft();
              window.location.reload();
            }}
          >
            Start over
          </Button>
        </div>
      ) : null}
      {guard.leaving ? (
        <SessionDialog title="Discard changes?" open onClose={guard.keepEditing}>
          <p className="mb-4 text-text-muted">What you typed on this page will be lost.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={guard.keepEditing}>
              Keep editing
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                clearProductDraft();
                guard.discard();
              }}
            >
              Discard
            </Button>
          </div>
        </SessionDialog>
      ) : null}
    </>
  );
}

function useSaveShortcuts(formRef: RefObject<HTMLFormElement | null>) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || (event.key !== 's' && event.key !== 'Enter')) return;
      event.preventDefault();
      const form = formRef.current;
      const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (form && submit && !submit.disabled) form.requestSubmit();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [formRef]);
}
