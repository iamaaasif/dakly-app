import { Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { useController } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Checkbox } from '@dakly/ui/checkbox';
import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@dakly/ui/popover';

import { useProductCollections, useProductTags } from '../api/get-categories';

const popularCount = 5;

type NameListKind = {
  name: 'tags' | 'collections';
  label: string;
  // Lower case, as it reads inside a sentence: "Add tags", "Other collections".
  singular: string;
  plural: string;
  useItems: () => { data?: { items: { id: string; name: string }[] } };
};

const tagsKind: NameListKind = {
  name: 'tags',
  label: 'Tags',
  singular: 'tag',
  plural: 'tags',
  useItems: useProductTags,
};
const collectionsKind: NameListKind = {
  name: 'collections',
  label: 'Collections',
  singular: 'collection',
  plural: 'collections',
  useItems: useProductCollections,
};

export function ProductTagsField() {
  return <NameListField kind={tagsKind} />;
}

export function ProductCollectionsField() {
  return <NameListField kind={collectionsKind} />;
}

// Tags and collections are both lists of names that a product picks from the shop's list or adds.
function NameListField({ kind }: { kind: NameListKind }) {
  const { field } = useController<ProductFormValues, 'tags' | 'collections'>({ name: kind.name });
  const selected = field.value ?? [];
  const toggle = (name: string, on: boolean) =>
    field.onChange(
      on
        ? [...selected, name]
        : selected.filter((tag) => tag.toLocaleLowerCase() !== name.toLocaleLowerCase()),
    );
  return (
    <div className="space-y-2">
      <Label>{kind.label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Add ${kind.plural}`}
            className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input-border bg-surface px-2 py-1.5 text-left text-sm text-text-muted hover:border-primary focus-visible:outline-2 focus-visible:outline-focus"
          >
            <Plus aria-hidden="true" size={14} />
            Add {kind.plural}
          </button>
        </PopoverTrigger>
        <PopoverContent aria-label={kind.label} className="w-80 space-y-2 p-0">
          <TagPicker kind={kind} selected={selected} onToggle={toggle} />
        </PopoverContent>
      </Popover>
      {selected.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((tag) => (
            <li
              key={tag}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface-muted py-0.5 pr-1 pl-2.5 text-sm text-text"
            >
              <span className="wrap-anywhere">{tag}</span>
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={() => toggle(tag, false)}
                className="inline-flex size-5 items-center justify-center rounded-full text-text-muted hover:bg-border hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
              >
                <X aria-hidden="true" size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type TagPickerProps = {
  kind: NameListKind;
  selected: string[];
  onToggle: (name: string, on: boolean) => void;
};

function useTagChoices(kind: NameListKind, selected: string[], search: string) {
  const { data } = kind.useItems();
  const query = search.trim();
  const lower = query.toLocaleLowerCase();
  const all = data?.items ?? [];
  const chosen = new Set(selected.map((tag) => tag.toLocaleLowerCase()));
  const known = all.filter(({ name }) => name.toLocaleLowerCase().includes(lower));
  const canAdd =
    query !== '' &&
    !chosen.has(lower) &&
    !all.some(({ name }) => name.toLocaleLowerCase() === lower);
  return {
    query,
    chosen,
    canAdd,
    empty: known.length === 0,
    popular: query ? [] : known.slice(0, popularCount),
    others: query ? known : known.slice(popularCount),
  };
}

function TagPicker({ kind, selected, onToggle }: TagPickerProps) {
  const [search, setSearch] = useState('');
  const id = useId();
  const { query, chosen, canAdd, empty, popular, others } = useTagChoices(kind, selected, search);
  const addTyped = () => {
    onToggle(query, true);
    setSearch('');
  };
  const group = { chosen, onToggle };
  return (
    <>
      <div className="border-b border-border p-2">
        <Input
          aria-label={`Search or add ${kind.plural}`}
          placeholder={`Search or add ${kind.plural}`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (canAdd) addTyped();
          }}
        />
      </div>
      <div className="max-h-64 overflow-y-auto px-1 pb-2">
        {canAdd ? (
          <button
            type="button"
            onClick={addTyped}
            className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-action hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus"
          >
            <Plus aria-hidden="true" size={14} />
            <span className="wrap-anywhere">Add “{query}”</span>
          </button>
        ) : null}
        <TagGroup id={`${id}-popular`} title="Frequently used" tags={popular} {...group} />
        <TagGroup
          id={`${id}-other`}
          title={query ? `Matching ${kind.plural}` : `Other ${kind.plural}`}
          tags={others}
          {...group}
        />
        {!canAdd && empty ? (
          <p className="px-2 py-3 text-sm text-text-muted">
            {query
              ? `No ${kind.singular} matches.`
              : `Type a name to add your first ${kind.singular}.`}
          </p>
        ) : null}
      </div>
    </>
  );
}

type TagGroupProps = {
  id: string;
  title: string;
  tags: { id: string; name: string }[];
  chosen: Set<string>;
  onToggle: (name: string, on: boolean) => void;
};

function TagGroup({ id, title, tags, chosen, onToggle }: TagGroupProps) {
  if (!tags.length) return null;
  return (
    <div role="group" aria-labelledby={id}>
      <p id={id} className="px-2 pt-2 text-xs font-medium text-text-muted">
        {title}
      </p>
      {tags.map(({ id: tagId, name }) => (
        <div
          key={tagId}
          className="flex min-h-10 items-center gap-3 rounded-md px-2 hover:bg-surface-muted"
        >
          <Checkbox
            id={`${id}-${tagId}`}
            checked={chosen.has(name.toLocaleLowerCase())}
            onCheckedChange={(on) => onToggle(name, on === true)}
          />
          <Label
            htmlFor={`${id}-${tagId}`}
            className="flex min-h-10 flex-1 cursor-pointer items-center"
          >
            <span className="wrap-anywhere">{name}</span>
          </Label>
        </div>
      ))}
    </div>
  );
}
