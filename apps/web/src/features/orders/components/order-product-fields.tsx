import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import type { FieldArrayWithId, UseFormRegister } from 'react-hook-form';

import type { OrderEditorValues, OrderCatalogueProduct } from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';

import {
  useOrderCatalogue,
  useOrderCatalogueProducts,
  useRememberCatalogueProduct,
} from '../api/order-catalogue';
import { formatMoney } from '@/lib/format-money';

export type VariantChoice = {
  productId?: string;
  label: string;
  price: number;
  stock: number | null;
};

type ProductFieldsProps = {
  fields: FieldArrayWithId<OrderEditorValues, 'items'>[];
  variants: Record<string, VariantChoice>;
  isNew: boolean;
  ids: string[];
  register: UseFormRegister<OrderEditorValues>;
  onChoose: (index: number, id: string, variant?: VariantChoice) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
};

export function OrderProductFields({
  fields,
  variants,
  isNew,
  ids,
  register,
  onChoose,
  onAdd,
  onRemove,
}: ProductFieldsProps) {
  const [search, setSearch] = useState('');
  const term = search.trim();
  const products = useOrderCatalogue(term.length >= 3 ? term : undefined);
  const pages = products.data?.pages ?? [];
  const pageProducts = pages.flatMap((page) => page.items);
  const choices = orderVariantChoices(pageProducts);
  const catalogue = pageProducts.filter(({ variants }) =>
    variants.some(({ pricePoisha }) => pricePoisha > 0),
  );
  const receivedAt = new Map(
    pages.flatMap((page) => page.items.map(({ id }) => [id, page.receivedAt] as const)),
  );
  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">Products</legend>
      <OrderCatalogueSearch {...{ search, setSearch }} error={products.error} collapsible={isNew} />
      {fields.map((field, index) => {
        const line = {
          ids,
          index,
          variants,
          register,
          onChoose,
          onRemove: fields.length > 1 ? onRemove : undefined,
        };
        return isNew ? (
          <NewOrderProductLine key={field.id} {...{ catalogue, receivedAt, ...line }} />
        ) : (
          <OrderProductLine key={field.id} choices={choices} {...line} />
        );
      })}
      {products.hasNextPage && (
        <Button
          variant="secondary"
          loading={products.isFetchingNextPage}
          onClick={() => void products.fetchNextPage()}
        >
          Load more products
        </Button>
      )}
      <Button variant="secondary" disabled={fields.length >= 100} onClick={onAdd}>
        {isNew && <Plus aria-hidden="true" size={16} strokeWidth={1.75} />}
        Add product
      </Button>
    </fieldset>
  );
}

function OrderCatalogueSearch({
  error,
  search,
  setSearch,
  collapsible,
}: {
  error: Error | null;
  search: string;
  setSearch: (value: string) => void;
  collapsible: boolean;
}) {
  const field = (
    <label className="block">
      {collapsible ? 'Product name' : 'Search products'}
      <Input maxLength={200} value={search} onChange={(event) => setSearch(event.target.value)} />
    </label>
  );
  return (
    <>
      {collapsible ? (
        <details className="space-y-2">
          <summary className="min-h-10 w-fit min-w-10 cursor-pointer leading-10 text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            Search products
          </summary>
          {field}
        </details>
      ) : (
        field
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error.message}
        </p>
      )}
    </>
  );
}

export function orderVariantChoices(
  products: OrderCatalogueProduct[],
): Record<string, VariantChoice> {
  return Object.fromEntries(
    products.flatMap((product) =>
      product.variants
        .filter((variant) => variant.pricePoisha > 0)
        .map(
          (variant) =>
            [
              variant.id,
              {
                productId: product.id,
                label: variant.isDefault ? product.name : `${product.name} · ${variant.title}`,
                price: variant.pricePoisha,
                stock: product.isStockTracked ? variant.available : null,
              },
            ] as const,
        ),
    ),
  );
}

type ProductLineProps = Pick<ProductFieldsProps, 'ids' | 'variants' | 'register' | 'onChoose'> & {
  choices: Record<string, VariantChoice>;
  index: number;
  onRemove?: ProductFieldsProps['onRemove'];
};

const selectClass =
  'min-h-10 w-full min-w-0 rounded-md border border-input-border bg-surface px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:bg-surface-muted aria-invalid:border-danger';

function NewOrderProductLine({
  catalogue,
  receivedAt,
  ids,
  index,
  variants,
  register,
  onChoose,
  onRemove,
}: Omit<ProductLineProps, 'choices'> & {
  catalogue: OrderCatalogueProduct[];
  receivedAt: Map<string, number>;
}) {
  const [productId, setProductId] = useState('');
  const rememberProduct = useRememberCatalogueProduct();
  const [selectedProduct] = useOrderCatalogueProducts(productId ? [productId] : []);
  const id = ids[index] ?? '';
  const product = selectedProduct?.data ?? catalogue.find(({ id }) => id === productId);
  const productChoices = product ? orderVariantChoices([product]) : {};
  const selected = variants[id] ?? productChoices[id];
  const isTaken = (variantId: string) => variantId !== id && ids.includes(variantId);
  function chooseProduct(next: OrderCatalogueProduct | undefined) {
    if (next) rememberProduct(next, receivedAt.get(next.id) ?? 0);
    setProductId(next?.id ?? '');
    onChoose(index, '');
  }
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="grid grid-cols-2 items-start gap-2 sm:grid-cols-[2fr_1.5fr_4rem_1fr]">
        <ProductChoiceField {...{ catalogue, product, index, isTaken }} onChange={chooseProduct} />
        <OrderSizeField
          {...{ id, index, product, isTaken }}
          choose={(nextId) => onChoose(index, nextId, productChoices[nextId])}
        />
        <FormField name={`items.${index}.quantity`} label="Qty">
          {(props) => (
            <Input
              {...props}
              type="number"
              aria-label={`Qty for product ${index + 1}`}
              {...register(`items.${index}.quantity`, { valueAsNumber: true })}
            />
          )}
        </FormField>
        <div className="space-y-2 text-sm">
          <p className="font-medium">Price</p>
          <p className="min-h-10 rounded-md bg-surface-muted px-2 py-2 tabular-nums">
            {selected ? formatMoney(selected.price) : '—'}
          </p>
        </div>
      </div>
      {onRemove && (
        <Button variant="secondary" onClick={() => onRemove(index)}>
          Remove
        </Button>
      )}
    </div>
  );
}

function ProductChoiceField({
  catalogue,
  product,
  index,
  isTaken,
  onChange,
}: {
  catalogue: OrderCatalogueProduct[];
  product?: OrderCatalogueProduct;
  index: number;
  isTaken: (id: string) => boolean;
  onChange: (product: OrderCatalogueProduct | undefined) => void;
}) {
  const productInput = useId();
  const entries =
    product && !catalogue.some(({ id }) => id === product.id) ? [product, ...catalogue] : catalogue;
  return (
    <div className="col-span-2 min-w-0 space-y-2 sm:col-span-1">
      <Label htmlFor={productInput}>Product</Label>
      <select
        id={productInput}
        aria-label={`Product ${index + 1}`}
        className={selectClass}
        value={product?.id ?? ''}
        onChange={(event) => onChange(entries.find(({ id }) => id === event.target.value))}
      >
        <option value="">Choose a product</option>
        {entries.map((entry) => (
          <option
            key={entry.id}
            value={entry.id}
            disabled={
              !entry.variants.some(({ id, pricePoisha }) => pricePoisha > 0 && !isTaken(id))
            }
          >
            {entry.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function OrderSizeField({
  id,
  index,
  product,
  isTaken,
  choose,
}: {
  id: string;
  index: number;
  product?: OrderCatalogueProduct;
  isTaken: (id: string) => boolean;
  choose: (id: string) => void;
}) {
  const options = product?.variants.filter(({ pricePoisha }) => pricePoisha > 0) ?? [];
  const selected = options.find((variant) => variant.id === id);
  const tracked = product?.isStockTracked;
  return (
    <FormField
      name={`items.${index}.variantId`}
      label="Size"
      hint={selected && tracked ? `${selected.available} in stock` : undefined}
    >
      {(props) => (
        <select
          {...props}
          aria-label={`Size ${index + 1}`}
          className={selectClass}
          value={selected?.id ?? ''}
          aria-invalid={props['aria-invalid'] || Boolean(id && !selected)}
          disabled={!options.length}
          onChange={(event) => choose(event.target.value)}
        >
          <option value="" disabled>
            Choose a size
          </option>
          {options.map((variant) => (
            <option key={variant.id} value={variant.id} disabled={isTaken(variant.id)}>
              {variant.isDefault ? 'Standard' : variant.title}
              {tracked ? ` · ${variant.available} left` : ''}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}

function OrderProductLine({
  choices,
  ids,
  index,
  variants,
  register,
  onChoose,
  onRemove,
}: ProductLineProps) {
  const id = ids[index] ?? '';
  const variant = variants[id];
  const options = variant ? { ...choices, [id]: variant } : choices;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-start gap-2 rounded-md border border-border p-2">
      <div>
        <FormField name={`items.${index}.variantId`} label={`Product and variant ${index + 1}`}>
          {(props) => (
            <select
              {...props}
              className="min-h-10 w-full rounded-md border border-input-border bg-surface px-2 aria-invalid:border-danger"
              value={id}
              onChange={(event) => onChoose(index, event.target.value, choices[event.target.value])}
            >
              <option value="">Choose a product</option>
              {Object.entries(options).map(([optionId, option]) => (
                <option
                  key={optionId}
                  value={optionId}
                  disabled={optionId !== id && ids.includes(optionId)}
                >
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {variant && <OrderVariantPrice variant={variant} />}
      </div>
      <FormField name={`items.${index}.quantity`} label={`Quantity ${index + 1}`}>
        {(props) => (
          <Input
            {...props}
            type="number"
            {...register(`items.${index}.quantity`, { valueAsNumber: true })}
          />
        )}
      </FormField>
      {onRemove ? (
        <Button className="mt-6" variant="secondary" onClick={() => onRemove(index)}>
          Remove
        </Button>
      ) : null}
    </div>
  );
}

function OrderVariantPrice({ variant }: { variant: VariantChoice }) {
  return (
    <p className="text-text-muted">
      {formatMoney(variant.price)}
      {variant.stock !== null ? ` · ${variant.stock} in stock` : ''}
    </p>
  );
}
