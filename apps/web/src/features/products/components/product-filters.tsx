'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Search } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useFormContext, FormProvider, useForm, useWatch, type Control } from 'react-hook-form';

import {
  productListBaseQuerySchema,
  type ProductListQuery,
  type ProductReadiness,
} from '@dakly/contracts/products';
import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { categoryOptions, useProductCategories } from '../api/get-categories';
import { productsSearch } from '../api/products';
import { readinessLabels } from '../product-labels';
import { useUrlRouter } from '@/lib/use-url-query';

const searchSchema = productListBaseQuerySchema.pick({ search: true });
const allValue = 'all';
const readinessKeys = Object.keys(readinessLabels) as ProductReadiness[];
const selectClass = 'w-auto min-w-36 bg-surface';

type ProductFiltersProps = { query: ProductListQuery };

export function ProductFilters({ query }: ProductFiltersProps) {
  const router = useUrlRouter();
  const form = useForm<Pick<ProductListQuery, 'search'>>({
    resolver: zodResolver(searchSchema),
    defaultValues: { search: query.search },
  });
  const choose = (change: Partial<ProductListQuery>) =>
    router.push(`/products?${productsSearch({ ...query, ...change, cursor: undefined })}`);
  useSearchAsYouType(form.control, query, (search) =>
    router.replace(`/products?${productsSearch({ ...query, search, cursor: undefined })}`),
  );
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-1">
      <FormProvider {...form}>
        <form
          className="w-full min-w-0 sm:w-auto sm:max-w-80 sm:flex-1"
          onSubmit={form.handleSubmit(({ search }) => choose({ search }))}
        >
          <SearchField />
        </form>
      </FormProvider>
      <CategoryFilter query={query} onChoose={choose} />
      <Select
        value={query.sort ?? 'best_selling'}
        onValueChange={(sort) => choose({ sort: sort === 'newest' ? sort : 'best_selling' })}
      >
        <SelectTrigger aria-label="Sort products" className={selectClass}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="best_selling">Best selling</SelectItem>
          <SelectItem value="newest">Newest</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={query.readiness ?? allValue}
        onValueChange={(readiness) =>
          choose({ readiness: readinessKeys.find((key) => key === readiness) })
        }
      >
        <SelectTrigger aria-label="Status" className={`${selectClass} md:hidden`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={allValue}>All products</SelectItem>
          {readinessKeys.map((value) => (
            <SelectItem key={value} value={value}>
              {readinessLabels[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const searchDelayMs = 300;

// Typing searches after a short pause. The server needs three letters, so shorter text waits.
function useSearchAsYouType(
  control: Control<Pick<ProductListQuery, 'search'>>,
  query: ProductListQuery,
  apply: (search: string | undefined) => void,
) {
  const typed = useWatch({ control, name: 'search' });
  const latest = useRef({ query, apply });
  latest.current = { query, apply };
  useEffect(() => {
    const search = typed?.trim() || undefined;
    if (search === latest.current.query.search || (search && search.length < 3)) return;
    const timer = setTimeout(() => latest.current.apply(search), searchDelayMs);
    return () => clearTimeout(timer);
  }, [typed]);
}

function SearchField() {
  const form = useFormContext<Pick<ProductListQuery, 'search'>>();
  return (
    <>
      <Label htmlFor="product-search" className="sr-only">
        Search products
      </Label>
      <div className="relative">
        <Search
          aria-hidden="true"
          size={16}
          strokeWidth={2}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
        />
        <Input
          id="product-search"
          type="search"
          placeholder="Search name or code"
          className="pl-9"
          {...form.register('search', {
            setValueAs: (value: string) => value.trim() || undefined,
          })}
        />
      </div>
    </>
  );
}

type CategoryFilterProps = ProductFiltersProps & {
  onChoose: (change: Partial<ProductListQuery>) => void;
};

// A parent category also shows its sub-categories, so one choice covers a whole branch.
function CategoryFilter({ query, onChoose }: CategoryFilterProps) {
  const options = categoryOptions(useProductCategories().data?.items ?? []);
  return (
    <Select
      value={query.categoryId ?? allValue}
      onValueChange={(value) => onChoose({ categoryId: value === allValue ? undefined : value })}
    >
      <SelectTrigger aria-label="Category" className={selectClass}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={allValue}>All categories</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
