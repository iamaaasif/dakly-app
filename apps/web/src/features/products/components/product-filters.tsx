'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Search } from 'lucide-react';
import { useFormContext, FormProvider, useForm } from 'react-hook-form';

import { productListQuerySchema, type ProductListQuery } from '@dakly/contracts/products';
import { cn } from '@dakly/ui/cn';
import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';

import { categoryOptions, useProductBrands, useProductCategories } from '../api/get-categories';
import { productsSearch } from '../api/products';
import { readinessLabels } from '../product-labels';
import { UrlLink } from '@/components/url-link';
import { useUrlRouter } from '@/lib/use-url-query';

const searchSchema = productListQuerySchema.pick({ search: true });
const readinessFilters = [
  undefined,
  'running_low',
  'out_of_stock',
  'needs_price',
  'needs_photo',
  'hidden',
] as const;

type ProductFiltersProps = { query: ProductListQuery };

export function ProductFilters({ query }: ProductFiltersProps) {
  const router = useUrlRouter();
  const form = useForm<Pick<ProductListQuery, 'search'>>({
    resolver: zodResolver(searchSchema),
    defaultValues: { search: query.search },
  });
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-lg border border-border bg-surface p-4">
      <FormProvider {...form}>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={form.handleSubmit(({ search }) =>
            router.push(`/products?${productsSearch({ ...query, search, cursor: undefined })}`),
          )}
        >
          <SearchField />
        </form>
      </FormProvider>
      <ListFilters query={query} />
      <ReadinessNav query={query} />
    </div>
  );
}

function SearchField() {
  const form = useFormContext<Pick<ProductListQuery, 'search'>>();
  return (
    <>
      <Label htmlFor="product-search" className="sr-only">
        Search products
      </Label>
      <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-initial">
        <Search
          aria-hidden="true"
          size={16}
          strokeWidth={2}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
        />
        <Input
          id="product-search"
          type="search"
          placeholder="Search by name"
          className="pl-9"
          {...form.register('search', {
            setValueAs: (value: string) => value.trim() || undefined,
          })}
        />
      </div>
    </>
  );
}

function ReadinessNav({ query }: ProductFiltersProps) {
  return (
    <nav aria-label="Product readiness" className="flex flex-wrap items-center gap-2">
      {readinessFilters.map((readiness) => (
        <UrlLink
          key={readiness ?? 'all'}
          href={`/products?${productsSearch({ ...query, readiness, cursor: undefined })}`}
          aria-current={query.readiness === readiness ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-10 items-center rounded-full border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            query.readiness === readiness
              ? 'border-inverse bg-inverse text-on-primary'
              : 'border-border bg-surface text-text hover:bg-surface-muted',
          )}
        >
          {readiness ? readinessLabels[readiness] : 'All'}
        </UrlLink>
      ))}
    </nav>
  );
}

const selectClass =
  'min-h-10 rounded-md border border-input-border bg-surface px-3 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

// Category and brand come from the shop's lists; a parent category also shows its sub-categories.
function ListFilters({ query }: ProductFiltersProps) {
  const router = useUrlRouter();
  const categories = useProductCategories().data?.items ?? [];
  const brands = useProductBrands().data?.items ?? [];
  const choose = (change: Partial<ProductListQuery>) =>
    router.push(`/products?${productsSearch({ ...query, ...change, cursor: undefined })}`);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ListFilterSelect
        label="Category"
        allLabel="All categories"
        value={query.categoryId}
        options={categoryOptions(categories)}
        onChange={(categoryId) => choose({ categoryId })}
      />
      <ListFilterSelect
        label="Brand"
        allLabel="All brands"
        value={query.brandId}
        options={brands.map((brand) => ({ value: brand.id, label: brand.name }))}
        onChange={(brandId) => choose({ brandId })}
      />
    </div>
  );
}

type ListFilterSelectProps = {
  label: string;
  allLabel: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
};

function ListFilterSelect({ label, allLabel, value, options, onChange }: ListFilterSelectProps) {
  if (!options.length) return null;
  return (
    <select
      aria-label={label}
      className={selectClass}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || undefined)}
    >
      <option value="">{allLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
