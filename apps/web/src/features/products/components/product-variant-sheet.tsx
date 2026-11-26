import type { ChangeEvent } from 'react';

import type { ProductResponse, ProductVariantResponse } from '@dakly/contracts/products';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Sheet } from '@dakly/ui/sheet';

import {
  profitPercent,
  variantLabel,
  type EditableField,
  type GridOption,
  type GridVariant,
} from '../product-variant-grid';
import { ProductPhotos } from './product-photos';

const fieldLabels: Record<EditableField, string> = {
  priceOverridePoisha: 'Price',
  costPoisha: 'Cost',
  initialStock: 'Stock',
  sku: 'Code',
  lowStockThreshold: 'Low stock warning',
};

type VariantEditorFieldProps = {
  index: number;
  variant: GridVariant;
  field: EditableField;
  label: string;
  placeholder?: string;
  readOnly?: boolean;
  inline?: boolean;
  onChange: (field: EditableField, value: string) => void;
};

export function VariantEditorField(props: VariantEditorFieldProps) {
  const { index, variant, field, label, placeholder, readOnly, inline, onChange } = props;
  const name = `variants.${index}.${field}`;
  const numeric = field === 'initialStock' || field === 'lowStockThreshold';
  const inputMode = numeric ? 'numeric' : 'decimal';
  return (
    <FormField name={name} label={`${fieldLabels[field]} for ${label}`} hideLabel={inline}>
      {(control) => (
        <Input
          {...control}
          autoComplete="off"
          inputMode={field === 'sku' ? undefined : inputMode}
          placeholder={placeholder}
          readOnly={readOnly}
          value={String(variant[field] ?? '')}
          data-grid-row={index}
          data-grid-field={field}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(field, event.target.value)}
          className={inline ? 'px-1.5 py-1 text-sm' : undefined}
        />
      )}
    </FormField>
  );
}

type ProductVariantSheetProps = Pick<
  VariantEditorFieldProps,
  'index' | 'variant' | 'readOnly' | 'onChange'
> & {
  options: GridOption[];
  product?: ProductResponse;
  saved?: ProductVariantResponse;
  productPrice: string;
  showStock: boolean;
  onClose: () => void;
  restoreFocusTo: () => HTMLButtonElement | null;
};

export function ProductVariantSheet(props: ProductVariantSheetProps) {
  const { index, options, variant, product, saved, productPrice, showStock, readOnly } = props;
  const label = variantLabel(variant, options);
  const input = { index, variant, label, readOnly, onChange: props.onChange };
  const profit = profitPercent(variant.priceOverridePoisha || productPrice, variant.costPoisha);
  return (
    <Sheet
      open
      title={label}
      onClose={props.onClose}
      restoreFocusTo={props.restoreFocusTo}
      description={
        readOnly ? undefined : 'Price, cost, stock and code changes are saved with the product.'
      }
    >
      <div className="space-y-4">
        <VariantEditorField {...input} field="priceOverridePoisha" placeholder={productPrice} />
        <VariantEditorField {...input} field="costPoisha" />
        {profit !== null && (
          <p aria-label={`Profit for ${label}`} className="text-sm text-text">
            Profit {profit}%
          </p>
        )}
        {showStock ? (
          <>
            <VariantEditorField {...input} field="initialStock" />
            <VariantEditorField {...input} field="lowStockThreshold" placeholder="Shop setting" />
          </>
        ) : (
          <p className="text-sm text-text-muted">Always available</p>
        )}
        <VariantEditorField {...input} field="sku" />
        {product && saved ? (
          <ProductPhotos
            product={product}
            variant={{ ...saved, title: label }}
            readOnly={readOnly}
          />
        ) : (
          <p className="text-sm text-text-muted">Save this variant to add photos.</p>
        )}
      </div>
    </Sheet>
  );
}
