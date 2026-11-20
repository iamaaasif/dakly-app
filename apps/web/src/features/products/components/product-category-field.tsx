'use client';
import { useId, useMemo, useState } from 'react';
import { useController } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { useProductCategories } from '../api/get-categories';

export function ProductCategoryField() {
  const { field } = useController<ProductFormValues, 'category'>({ name: 'category' });
  const id = useId();
  const { data } = useProductCategories();
  const categories = useMemo(() => {
    const list = data?.items ?? [];
    if (field.value?.trim() && !list.includes(field.value.trim())) {
      return [...list, field.value.trim()];
    }
    return list;
  }, [data?.items, field.value]);

  const [isNew, setIsNew] = useState(() =>
    Boolean(field.value && !categories.includes(field.value)),
  );
  const selectValue = isNew ? '__new__' : (field.value ?? undefined);

  if (isNew) {
    return (
      <NewCategoryInput
        id={id}
        value={field.value ?? ''}
        hasExisting={categories.length > 0}
        onChange={field.onChange}
        onBlur={field.onBlur}
        onChooseExisting={() => {
          setIsNew(false);
          field.onChange(categories[0] ?? '');
        }}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Category</Label>
      <Select
        value={selectValue}
        onValueChange={(value) => {
          if (value === '__new__') {
            setIsNew(true);
            field.onChange('');
          } else {
            field.onChange(value);
          }
        }}
      >
        <SelectTrigger id={id} onBlur={field.onBlur}>
          <SelectValue placeholder="Choose a category" />
        </SelectTrigger>
        <SelectContent>
          {categories.map((cat) => (
            <SelectItem key={cat} value={cat}>
              {cat}
            </SelectItem>
          ))}
          <SelectItem value="__new__">+ New category</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

type NewCategoryInputProps = {
  id: string;
  value: string;
  hasExisting: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
  onChooseExisting: () => void;
};

function NewCategoryInput({
  id,
  value,
  hasExisting,
  onChange,
  onBlur,
  onChooseExisting,
}: NewCategoryInputProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>Category</Label>
        {hasExisting ? (
          <button
            type="button"
            onClick={onChooseExisting}
            className="text-xs text-text-muted hover:text-text hover:underline"
          >
            Choose existing
          </button>
        ) : null}
      </div>
      <Input
        id={id}
        autoFocus
        placeholder="e.g. Men"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
}
