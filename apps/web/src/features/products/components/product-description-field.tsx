import { Sparkles } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useController, useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { FormField } from '@dakly/ui/form-field';
import { Textarea } from '@dakly/ui/textarea';

import { ProductDescriptionToolbar } from './product-description-toolbar';
import { ProductDescriptionWriter } from './product-description-writer';

type ProductDescriptionFieldProps = { productId?: string; onPage?: boolean };

export function ProductDescriptionField({ productId, onPage }: ProductDescriptionFieldProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const box = useRef<HTMLTextAreaElement | null>(null);
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
          <div>
            {onPage ? <ProductDescriptionToolbar target={box} onChange={field.onChange} /> : null}
            <Textarea
              {...control}
              ref={(element) => {
                field.ref(element);
                box.current = element;
              }}
              onBlur={field.onBlur}
              rows={onPage ? 6 : 3}
              placeholder="Fabric, fit, what makes it special"
              className={onPage ? 'min-h-32 rounded-t-none' : 'min-h-18'}
              value={field.value ?? ''}
              onChange={field.onChange}
            />
          </div>
        )}
      </FormField>
      <WriterPanel id={panelId} open={open} productId={productId} onDone={() => setOpen(false)} />
    </div>
  );
}

type WriterPanelProps = { id: string; open: boolean; productId?: string; onDone: () => void };

function WriterPanel({ id, open, productId, onDone }: WriterPanelProps) {
  const { setFocus, setValue } = useFormContext<ProductFormValues>();
  return (
    <section
      id={id}
      hidden={!open}
      aria-label="Write with AI"
      className="rounded-md border border-border p-3"
    >
      {productId ? (
        <ProductDescriptionWriter
          productId={productId}
          onPick={(body) => {
            setValue('description', body, { shouldDirty: true, shouldValidate: true });
            onDone();
            setFocus('description');
          }}
        />
      ) : (
        <p className="text-sm text-text-muted">Save the product to write a description with AI.</p>
      )}
    </section>
  );
}
