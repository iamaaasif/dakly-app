import { useState } from 'react';

import type { AdLinkSource, AdListItem } from '@dakly/contracts/ad-links';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { Dialog } from '@dakly/ui/dialog';
import { Input } from '@dakly/ui/input';

import { useSetAdProducts } from '../api/ads';
import { useProductSearch } from '../api/reply-tools';

const maxProducts = 4;

type AdProductPickerProps = {
  adKey: { source: AdLinkSource; externalId: string };
  selected: AdListItem['products'];
  onDone: () => void;
};

type ProductChoicesProps = {
  items: { id: string; name: string }[];
  chosen: Map<string, string>;
  onToggle: (id: string, name: string) => void;
};

function ProductChoices({ items, chosen, onToggle }: ProductChoicesProps) {
  return (
    <ul className="max-h-72 space-y-1 overflow-y-auto">
      {items.map((product) => {
        const checked = chosen.has(product.id);
        return (
          <li key={product.id} className="flex items-center gap-3 py-1">
            <Checkbox
              id={`ad-product-${product.id}`}
              checked={checked}
              disabled={!checked && chosen.size >= maxProducts}
              onCheckedChange={() => onToggle(product.id, product.name)}
            />
            <label htmlFor={`ad-product-${product.id}`}>{product.name}</label>
          </li>
        );
      })}
    </ul>
  );
}

export function AdProductPicker({ adKey, selected, onDone }: AdProductPickerProps) {
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState(() => new Map(selected.map((p) => [p.productId, p.name])));
  const [failure, setFailure] = useState<string>();
  const term = search.trim();
  const products = useProductSearch(term);
  const save = useSetAdProducts();
  const toggle = (id: string, name: string) =>
    setChosen((current) => {
      const next = new Map(current);
      if (!next.delete(id) && next.size < maxProducts) next.set(id, name);
      return next;
    });
  const submit = async () => {
    try {
      await save.mutateAsync({ key: adKey, input: [...chosen.keys()] });
      onDone();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Try again');
    }
  };
  return (
    <Dialog title="Products in this ad" open closeDisabled={save.isPending} onClose={onDone}>
      <div className="space-y-3">
        <p className="text-text-muted">Pick up to {maxProducts} products the ad shows.</p>
        <Input
          aria-label="Search products"
          placeholder="Search by name"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <ProductChoices items={products.data?.items ?? []} chosen={chosen} onToggle={toggle} />
        <p className="text-sm text-text-muted">
          {chosen.size} of {maxProducts} picked
        </p>
        {failure ? (
          <p role="alert" className="text-sm text-danger">
            {failure}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="secondary" onClick={onDone} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            disabled={chosen.size === 0}
            onClick={() => void submit()}
          >
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
