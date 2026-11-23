import { useId, useState } from 'react';
import { useController } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { useCreateProductBrand, useCreateProductCategory } from '../api/create-product-list-item';
import { categoryOptions, useProductBrands, useProductCategories } from '../api/get-categories';

const ADD_NEW = '__new__';
const NONE = '__none__';

export function ProductCategoryField() {
  const { field } = useController<ProductFormValues, 'categoryId'>({ name: 'categoryId' });
  const { data } = useProductCategories();
  const create = useCreateProductCategory();
  return (
    <ListPicker
      noun="category"
      options={categoryOptions(data?.items ?? [])}
      value={field.value ?? null}
      onChange={field.onChange}
      pending={create.isPending}
      onCreate={(name, done) =>
        create.mutate({ name, parentId: null }, { onSuccess: ({ id }) => done(id) })
      }
    />
  );
}

export function ProductBrandField() {
  const { field } = useController<ProductFormValues, 'brandId'>({ name: 'brandId' });
  const { data } = useProductBrands();
  const create = useCreateProductBrand();
  return (
    <ListPicker
      noun="brand"
      options={(data?.items ?? []).map(({ id, name }) => ({ value: id, label: name }))}
      value={field.value ?? null}
      onChange={field.onChange}
      pending={create.isPending}
      onCreate={(name, done) => create.mutate({ name }, { onSuccess: ({ id }) => done(id) })}
    />
  );
}

type ListPickerProps = {
  noun: 'category' | 'brand';
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
  pending: boolean;
  onCreate: (name: string, done: (id: string) => void) => void;
};

// A choice from the shop's own list, with a way to add an item without leaving the form.
function ListPicker({ noun, options, value, onChange, pending, onCreate }: ListPickerProps) {
  const id = useId();
  const [name, setName] = useState<string | null>(null);
  if (name !== null)
    return (
      <NewItem
        id={id}
        noun={noun}
        name={name}
        pending={pending}
        onName={setName}
        onCancel={() => setName(null)}
        onAdd={() =>
          onCreate(name.trim(), (created) => {
            onChange(created);
            setName(null);
          })
        }
      />
    );
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{noun === 'category' ? 'Category' : 'Brand'}</Label>
      <Select
        value={value ?? NONE}
        onValueChange={(next) => {
          if (next === ADD_NEW) setName('');
          else onChange(next === NONE ? null : next);
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No {noun}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
          <SelectItem value={ADD_NEW}>+ New {noun}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

type NewItemProps = {
  id: string;
  noun: string;
  name: string;
  pending: boolean;
  onName: (name: string) => void;
  onAdd: () => void;
  onCancel: () => void;
};

// Not a form element: it sits inside the product form, and Enter must not save the product.
function NewItem({ id, noun, name, pending, onName, onAdd, onCancel }: NewItemProps) {
  const canAdd = Boolean(name.trim()) && !pending;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>New {noun}</Label>
      <Input
        id={id}
        autoFocus
        value={name}
        onChange={(event) => onName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          if (canAdd) onAdd();
        }}
      />
      <div className="flex gap-2">
        <Button disabled={!canAdd} onClick={onAdd}>
          Add
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
