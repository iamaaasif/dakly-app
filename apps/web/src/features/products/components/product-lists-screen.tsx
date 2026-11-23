'use client';
import Link from 'next/link';
import { useState } from 'react';

import type { ProductCategoryResponse } from '@dakly/contracts/product-lists';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

import {
  useChangeProductListItem,
  useDeleteProductListItem,
} from '../api/change-product-list-item';
import { useProductBrands, useProductCategories } from '../api/get-categories';
import { StorePage } from '@/components/store-page';
import { useSessionContext } from '@/lib/session-context';

export function ProductListsScreen() {
  const canEdit = Boolean(useSessionContext().data?.currentStore?.canEditProducts);
  return (
    <StorePage permission="canViewProducts">
      <main className="space-y-6 p-6 md:p-8">
        <header>
          <Link href="/products" className="text-sm text-text-muted hover:underline">
            Back to products
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-text">Categories and brands</h1>
          <p className="mt-1 text-sm text-text-muted">
            The lists you pick from when you add a product. A category can sit under one other
            category. Move a list item&apos;s products before you delete it.
          </p>
        </header>
        <Categories canEdit={canEdit} />
        <Brands canEdit={canEdit} />
      </main>
    </StorePage>
  );
}

function Categories({ canEdit }: { canEdit: boolean }) {
  const { data } = useProductCategories();
  const items = data?.items ?? [];
  const top = items.filter((item) => item.parentId === null);
  const rows = top.flatMap((parent) => [
    parent,
    ...items.filter((item) => item.parentId === parent.id),
  ]);
  return (
    <section aria-label="Categories" className="space-y-2">
      <h2 className="text-lg font-semibold text-text">Categories</h2>
      {rows.length ? null : <p className="text-sm text-text-muted">No categories yet.</p>}
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {rows.map((item) => (
          <ListRow
            key={item.id}
            kind="categories"
            id={item.id}
            name={item.name}
            productCount={item.productCount}
            indent={item.parentId !== null}
            canEdit={canEdit}
            deletable={!items.some((other) => other.parentId === item.id)}
            parents={movableUnder(item, items, top)}
            parentId={item.parentId}
          />
        ))}
      </ul>
    </section>
  );
}

function movableUnder(
  item: ProductCategoryResponse,
  items: ProductCategoryResponse[],
  top: ProductCategoryResponse[],
) {
  const hasChildren = items.some((other) => other.parentId === item.id);
  if (hasChildren) return undefined;
  return top.filter((parent) => parent.id !== item.id);
}

function Brands({ canEdit }: { canEdit: boolean }) {
  const items = useProductBrands().data?.items ?? [];
  return (
    <section aria-label="Brands" className="space-y-2">
      <h2 className="text-lg font-semibold text-text">Brands</h2>
      {items.length ? null : <p className="text-sm text-text-muted">No brands yet.</p>}
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {items.map((item) => (
          <ListRow
            key={item.id}
            kind="brands"
            id={item.id}
            name={item.name}
            productCount={item.productCount}
            canEdit={canEdit}
            deletable
          />
        ))}
      </ul>
    </section>
  );
}

type ListKind = 'categories' | 'brands';

type ListRowProps = {
  kind: ListKind;
  id: string;
  name: string;
  productCount: number;
  canEdit: boolean;
  deletable: boolean;
  indent?: boolean;
  // Top-level categories that this one may move under; undefined when it cannot move.
  parents?: { id: string; name: string }[];
  parentId?: string | null;
};

function ListRow({
  kind,
  id,
  name,
  productCount,
  canEdit,
  deletable,
  indent,
  parents,
  parentId,
}: ListRowProps) {
  const change = useChangeProductListItem(kind);
  const remove = useDeleteProductListItem(kind);
  const error = change.error ?? remove.error;
  return (
    <li className={indent ? 'space-y-1 p-3 pl-8' : 'space-y-1 p-3'}>
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <RenameForm
            name={name}
            pending={change.isPending}
            onRename={(next) => change.mutate({ id, name: next })}
          />
        ) : (
          <span className="flex-1 font-medium text-text">{name}</span>
        )}
        <span className="text-sm text-text-muted">
          {productCount} {productCount === 1 ? 'product' : 'products'}
        </span>
        {canEdit ? (
          <RowActions
            name={name}
            parents={parents}
            parentId={parentId ?? null}
            deletable={deletable && productCount === 0}
            pending={remove.isPending}
            onMove={(next) => change.mutate({ id, parentId: next })}
            onDelete={() => remove.mutate(id)}
          />
        ) : null}
      </div>
      {error instanceof ApiError ? (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      ) : null}
    </li>
  );
}

type RowActionsProps = {
  name: string;
  parents?: { id: string; name: string }[];
  parentId: string | null;
  deletable: boolean;
  pending: boolean;
  onMove: (parentId: string | null) => void;
  onDelete: () => void;
};

function RowActions(props: RowActionsProps) {
  return (
    <>
      {props.parents ? (
        <ParentSelect
          name={props.name}
          parents={props.parents}
          parentId={props.parentId}
          onChange={props.onMove}
        />
      ) : null}
      <Button
        variant="danger"
        disabled={!props.deletable || props.pending}
        onClick={props.onDelete}
      >
        Delete
      </Button>
    </>
  );
}

function RenameForm(props: { name: string; pending: boolean; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(props.name);
  const next = draft.trim();
  return (
    <>
      <Input
        aria-label={`Name of ${props.name}`}
        className="min-w-40 flex-1"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <Button
        variant="secondary"
        disabled={!next || next === props.name || props.pending}
        onClick={() => props.onRename(next)}
      >
        Rename
      </Button>
    </>
  );
}

type ParentSelectProps = {
  name: string;
  parents: { id: string; name: string }[];
  parentId: string | null;
  onChange: (parentId: string | null) => void;
};

function ParentSelect({ name, parents, parentId, onChange }: ParentSelectProps) {
  return (
    <select
      aria-label={`Put ${name} under`}
      className="min-h-10 rounded-md border border-input-border bg-surface px-3 text-sm text-text"
      value={parentId ?? ''}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">Top level</option>
      {parents.map((parent) => (
        <option key={parent.id} value={parent.id}>
          Under {parent.name}
        </option>
      ))}
    </select>
  );
}
