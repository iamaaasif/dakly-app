import { Camera, ChevronDown, CircleAlert, Eye, Pencil } from 'lucide-react';
import Image from 'next/image';
import { useFormState } from 'react-hook-form';

import { formatMoney } from '@dakly/contracts/money';
import {
  takaInput,
  type ProductFormValues,
  type ProductVariantResponse,
} from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { cn } from '@dakly/ui/cn';
import { Input } from '@dakly/ui/input';

import {
  availableStock,
  rowKey,
  variantLabel,
  type EditableField,
  type GridOption,
  type GridVariant,
  type VariantGroup,
} from '../product-variant-grid';
import { VariantEditorField } from './product-variant-sheet';

export const variantTableColumns =
  'grid-cols-[1.5rem_2rem_minmax(0,1fr)_2.5rem] gap-2 @lg:grid-cols-[1.5rem_2rem_minmax(0,1.5fr)_minmax(4.5rem,1fr)_minmax(4.5rem,1fr)_minmax(4rem,0.8fr)_2.5rem]';

type VariantGroupRowsProps = {
  group: VariantGroup;
  options: GridOption[];
  savedById: Map<string, ProductVariantResponse>;
  productPrice: string;
  showStock: boolean;
  readOnly?: boolean;
  selected: string[];
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (key: string, checked: boolean) => void;
  onEdit: (key: string, button: HTMLButtonElement) => void;
  onChange: (indexes: number[], field: EditableField, value: string) => void;
};

export function VariantGroupRows(props: VariantGroupRowsProps) {
  const { group, options, savedById, productPrice, showStock, readOnly, selected, collapsed } =
    props;
  const { label, rows } = group;
  return (
    <section aria-label={`${label} variants`}>
      <VariantGroupHeader {...props} />
      {!collapsed && (
        <ul>
          {rows.map(({ variant, index }) => {
            const key = rowKey(variant);
            return (
              <VariantTableRow
                key={key}
                index={index}
                variant={variant}
                label={variantLabel(variant, options)}
                saved={savedById.get(variant.id ?? '')}
                productPrice={productPrice}
                showStock={showStock}
                selected={selected.includes(key)}
                readOnly={readOnly}
                onSelect={(checked) => props.onSelect(key, checked)}
                onEdit={(button) => props.onEdit(key, button)}
                onChange={(field, value) => props.onChange([index], field, value)}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

function VariantGroupHeader({
  group,
  savedById,
  showStock,
  readOnly,
  collapsed,
  onToggle,
  onChange,
}: VariantGroupRowsProps) {
  const { label, rows } = group;
  const indexes = rows.map(({ index }) => index);
  const available = rows.reduce(
    (total, { variant }) =>
      total + availableStock(variant, savedById.get(variant.id ?? '')?.reserved),
    0,
  );
  const amountLabel = showStock ? `${available} pcs` : 'Always available';
  return (
    <div
      className={cn(
        'grid items-center border-t border-border bg-surface-muted px-2 py-1',
        variantTableColumns,
      )}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        className="col-span-4 flex min-h-10 min-w-0 items-center gap-2 rounded-sm text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus @lg:col-span-3"
        onClick={onToggle}
      >
        <ChevronDown
          aria-hidden="true"
          className={cn('size-4 shrink-0', collapsed && '-rotate-90')}
        />
        <span className="min-w-0 truncate font-semibold text-text">{label}</span>
        <span className="shrink-0 text-xs text-text-muted">
          {rows.length} {rows.length === 1 ? 'variant' : 'variants'}
        </span>
        <span className="ml-auto shrink-0 text-xs text-text-muted @lg:hidden">{amountLabel}</span>
      </button>
      {!readOnly &&
        (['priceOverridePoisha', 'costPoisha'] as const).map((field) => (
          <GroupAmount
            key={field}
            group={group}
            field={field}
            onChange={(value) => onChange(indexes, field, value)}
          />
        ))}
      <span className="hidden text-xs text-text-muted @lg:col-start-6 @lg:block">
        {amountLabel}
      </span>
    </div>
  );
}

function GroupAmount({
  group,
  field,
  onChange,
}: {
  group: VariantGroup;
  field: 'priceOverridePoisha' | 'costPoisha';
  onChange: (value: string) => void;
}) {
  const label = field === 'priceOverridePoisha' ? 'Price' : 'Cost';
  const first = group.rows[0]?.variant[field] ?? '';
  const mixed = group.rows.some(({ variant }) => (variant[field] ?? '') !== first);
  return (
    <label className="col-span-2 space-y-1 text-xs text-text-muted @lg:col-span-1">
      <span className="@lg:sr-only">{label} for group</span>
      <Input
        aria-label={`${label} for all ${group.label} variants`}
        inputMode="decimal"
        value={mixed ? '' : first}
        placeholder={mixed ? 'Mixed' : label}
        className="px-1.5 py-1 text-sm"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

type VariantTableRowProps = {
  index: number;
  variant: GridVariant;
  label: string;
  saved?: ProductVariantResponse;
  productPrice: string;
  showStock: boolean;
  selected: boolean;
  readOnly?: boolean;
  onSelect: (checked: boolean) => void;
  onEdit: (button: HTMLButtonElement) => void;
  onChange: (field: EditableField, value: string) => void;
};

function VariantTableRow(props: VariantTableRowProps) {
  const { index, variant, label, saved, productPrice, showStock, readOnly, selected } = props;
  const fields = { index, variant, label, readOnly, onChange: props.onChange };
  const stock = showStock ? `${availableStock(variant, saved?.reserved)} pcs` : 'Always available';
  const Icon = readOnly ? Eye : Pencil;
  return (
    <li
      className={cn(
        'grid min-h-12 items-center border-t border-border px-2 py-1',
        variantTableColumns,
      )}
    >
      {readOnly ? (
        <span />
      ) : (
        <Checkbox
          aria-label={`Select ${label}`}
          checked={selected}
          onCheckedChange={(value) => props.onSelect(value === true)}
        />
      )}
      <VariantPhoto image={saved?.photos[0]} label={label} />
      <RowSummary
        {...{ index, label, stock }}
        price={variant.priceOverridePoisha || productPrice}
        onEdit={props.onEdit}
      />
      <div className="hidden @lg:block">
        <VariantEditorField
          {...fields}
          inline
          field="priceOverridePoisha"
          placeholder={productPrice}
        />
      </div>
      <div className="hidden @lg:block">
        <VariantEditorField {...fields} inline field="costPoisha" />
      </div>
      <span className="hidden text-xs text-text-muted tabular-nums @lg:block">{stock}</span>
      <Button
        type="button"
        variant="secondary"
        className="px-0"
        aria-label={`${readOnly ? 'View' : 'Edit'} variant ${label}`}
        onClick={(event) => props.onEdit(event.currentTarget)}
      >
        <Icon size={16} aria-hidden="true" />
      </Button>
    </li>
  );
}

function VariantPhoto({
  image,
  label,
}: {
  image?: ProductVariantResponse['photos'][number];
  label: string;
}) {
  return image ? (
    <Image
      src={image.url}
      alt={`Photo for ${label}`}
      width={32}
      height={32}
      unoptimized
      className="size-8 rounded-sm object-cover"
    />
  ) : (
    <span className="grid size-8 place-items-center rounded-sm border border-dashed border-border-strong text-text-muted">
      <Camera aria-hidden="true" size={16} />
    </span>
  );
}

function RowSummary({
  index,
  label,
  stock,
  price,
  onEdit,
}: {
  index: number;
  label: string;
  stock: string;
  price: string;
  onEdit: (button: HTMLButtonElement) => void;
}) {
  const { errors } = useFormState<ProductFormValues>({ name: `variants.${index}` });
  const paid = takaInput.safeParse(price);
  const summary = `${paid.success ? formatMoney(paid.data) : 'No price'} · ${stock}`;
  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-label={`${label} summary, ${summary}`}
        onClick={(event) => onEdit(event.currentTarget)}
        className="flex min-h-10 w-full min-w-0 items-center gap-1 rounded-sm text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus @lg:hidden"
      >
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <span className="max-w-[65%] truncate text-xs text-text-muted">{summary}</span>
      </button>
      <span className="hidden text-sm font-medium wrap-anywhere @lg:block">{label}</span>
      {errors.variants?.[index] && (
        <span className="flex items-center gap-1 text-xs text-danger">
          <CircleAlert aria-hidden="true" size={14} /> Check fields
        </span>
      )}
    </div>
  );
}
