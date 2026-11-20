import { Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { useController, useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { FormField } from '@dakly/ui/form-field';
import { Textarea } from '@dakly/ui/textarea';

import { ProductDescriptionWriter } from './product-description-writer';

type ProductDescriptionFieldProps = { productId?: string };

export function ProductDescriptionField({ productId }: ProductDescriptionFieldProps) {
  const { setFocus, setValue } = useFormContext<ProductFormValues>();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { field } = useController<ProductFormValues, 'description'>({ name: 'description' });

  return (
    <div className="space-y-2">
      <FormField
        name="description"
        label="Description"
        action={
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen(!open)}
            className="rounded inline-flex items-center gap-1 border border-border bg-surface px-2 py-0.5 text-xs font-medium text-text-muted transition-colors hover:border-primary hover:text-primary"
          >
            <Sparkles aria-hidden="true" size={12} />
            Write with AI
          </button>
        }
      >
        {(control) => (
          <Textarea
            {...control}
            ref={field.ref}
            onBlur={field.onBlur}
            rows={3}
            placeholder="Fabric, fit, what makes it special"
            className="min-h-18"
            value={field.value ?? ''}
            onChange={field.onChange}
          />
        )}
      </FormField>
      <section
        id={panelId}
        hidden={!open}
        aria-label="Write with AI"
        className="rounded-md border border-border p-3"
      >
        {productId ? (
          <ProductDescriptionWriter
            productId={productId}
            onPick={(body) => {
              setValue('description', body, { shouldDirty: true, shouldValidate: true });
              setOpen(false);
              setFocus('description');
            }}
          />
        ) : (
          <p className="text-sm text-text-muted">
            Save the product to write a description with AI.
          </p>
        )}
      </section>
    </div>
  );
}
