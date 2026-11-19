import { Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';

import { ProductDescriptionWriter } from './product-description-writer';
import { ProductLinesField } from './product-lines-field';

type ProductDescriptionFieldProps = { productId?: string };

export function ProductDescriptionField({ productId }: ProductDescriptionFieldProps) {
  const { setFocus, setValue } = useFormContext<ProductFormValues>();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="relative space-y-2">
      <Button
        variant="secondary"
        aria-expanded={open}
        aria-controls={panelId}
        className="absolute -top-3 right-0 px-2 text-sm"
        onClick={() => setOpen(!open)}
      >
        <Sparkles aria-hidden="true" className="size-4" />
        Write with AI
      </Button>
      <ProductLinesField name="description" label="Description" />
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
