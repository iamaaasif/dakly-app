import { useState } from 'react';
import { useController } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { FormField } from '@dakly/ui/form-field';
import { Textarea } from '@dakly/ui/textarea';

const limit = 300;

// A one-line summary for chat replies. It stays folded until the owner wants it.
export function ProductShortDescriptionField() {
  const { field } = useController<ProductFormValues, 'shortDescription'>({
    name: 'shortDescription',
  });
  const [open, setOpen] = useState(Boolean(field.value));
  const text = field.value ?? '';
  return (
    <div className="space-y-2">
      {open ? (
        <FormField
          name="shortDescription"
          label="Short description"
          action={
            <span className="text-xs text-text-muted" aria-live="polite">
              {text.length}/{limit}
            </span>
          }
        >
          {(control) => (
            <Textarea
              {...control}
              ref={field.ref}
              autoFocus={!field.value}
              rows={2}
              maxLength={limit}
              placeholder="One or two lines a customer reads first"
              className="min-h-14"
              value={text}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        </FormField>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-text">Short description</span>
          <button
            type="button"
            aria-label="Add short description"
            onClick={() => setOpen(true)}
            className="rounded-md border border-border bg-surface-muted px-3 py-1 text-sm font-medium text-text hover:border-primary focus-visible:outline-2 focus-visible:outline-focus"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
