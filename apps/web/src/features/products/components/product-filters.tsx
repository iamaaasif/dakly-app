'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormProvider, useForm } from 'react-hook-form';

import { productListQuerySchema, type ProductListQuery } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { productsSearch } from '@/lib/product-queries';
import { readinessLabels } from '../product-labels';

const searchSchema = productListQuerySchema.pick({ search: true });
type ProductFiltersProps = { query: ProductListQuery };
export function ProductFilters({ query }: ProductFiltersProps) {
  const router = useRouter();
  const form = useForm<Pick<ProductListQuery, 'search'>>({
    resolver: zodResolver(searchSchema),
    defaultValues: { search: query.search },
  });
  return (
    <div className="flex flex-col gap-4 rounded-t-lg border border-border bg-surface p-4 xl:flex-row xl:items-end xl:justify-between">
      <FormProvider {...form}>
        <form
          className="flex items-end gap-2"
          onSubmit={form.handleSubmit(({ search }) =>
            router.push(`/products?${productsSearch({ search, readiness: query.readiness })}`),
          )}
        >
          <FormField name="search" label="Search products">
            {(control) => (
              <Input
                {...control}
                type="search"
                placeholder="Search by name"
                {...form.register('search', {
                  setValueAs: (value: string) => value.trim() || undefined,
                })}
              />
            )}
          </FormField>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </FormProvider>
      <nav aria-label="Product readiness" className="flex flex-wrap gap-2">
        {([undefined, 'running_low', 'needs_price', 'needs_photo', 'hidden'] as const).map(
          (readiness) => (
            <Link
              key={readiness ?? 'all'}
              href={`/products?${productsSearch({ search: query.search, readiness })}`}
              aria-current={query.readiness === readiness ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 items-center rounded-full border border-input-border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                query.readiness === readiness
                  ? 'bg-inverse text-on-primary'
                  : 'bg-surface text-text hover:bg-surface-muted',
              )}
            >
              {readiness ? readinessLabels[readiness] : 'All'}
            </Link>
          ),
        )}
      </nav>
    </div>
  );
}
