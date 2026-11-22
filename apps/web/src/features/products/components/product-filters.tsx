'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormContext, FormProvider, useForm } from 'react-hook-form';

import { productListQuerySchema, type ProductListQuery } from '@dakly/contracts/products';
import { cn } from '@dakly/ui/cn';
import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';

import { productsSearch } from '../api/products';
import { readinessLabels } from '../product-labels';

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
  const router = useRouter();
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
            router.push(`/products?${productsSearch({ search, readiness: query.readiness })}`),
          )}
        >
          <SearchField />
        </form>
      </FormProvider>
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
        <Link
          key={readiness ?? 'all'}
          href={`/products?${productsSearch({ search: query.search, readiness })}`}
          aria-current={query.readiness === readiness ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-10 items-center rounded-full border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            query.readiness === readiness
              ? 'border-inverse bg-inverse text-on-primary'
              : 'border-border bg-surface text-text hover:bg-surface-muted',
          )}
        >
          {readiness ? readinessLabels[readiness] : 'All'}
        </Link>
      ))}
    </nav>
  );
}
