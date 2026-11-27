import { Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import type { ProductListItem } from '@dakly/contracts/products';
import { Checkbox } from '@dakly/ui/checkbox';
import { Input } from '@dakly/ui/input';

import {
  useCommentedPostChoices,
  useProductChoices,
  useShopPostChoices,
} from '../api/trigger-choices';
import { mergePostChoices } from '../workflow-post-choices';
import { toggleValue } from '../workflow-trigger-filters';

function Thumbnail({ url }: { url: string | null | undefined }) {
  if (url)
    return (
      <Image
        src={url}
        alt=""
        width={44}
        height={44}
        unoptimized
        loading="lazy"
        className="size-11 shrink-0 rounded-md object-cover"
      />
    );
  return (
    <span
      aria-hidden="true"
      className="grid size-11 shrink-0 place-items-center rounded-md bg-surface-muted text-text-subtle"
    >
      <ImageIcon size={18} strokeWidth={1.75} />
    </span>
  );
}

type PickerProps = { selected: readonly string[]; onChange: (ids: string[]) => void };

function Row({
  checked,
  onToggle,
  thumbnail,
  title,
  detail,
}: {
  checked: boolean;
  onToggle: () => void;
  thumbnail: string | null | undefined;
  title: string;
  detail?: string;
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-muted">
        <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={title} />
        <Thumbnail url={thumbnail} />
        <span className="min-w-0">
          <span className="line-clamp-2">{title}</span>
          {detail && <span className="block truncate text-sm text-text-muted">{detail}</span>}
        </span>
      </label>
    </li>
  );
}

const shortCaption = (caption: string | null) => caption?.trim() || 'Post without a caption';

export function PostPicker({ selected, onChange }: PickerProps) {
  const shop = useShopPostChoices(true);
  const commented = useCommentedPostChoices(true);
  const choices = mergePostChoices(shop.data?.items ?? [], commented.data?.items ?? []);
  const known = new Set(choices.map((choice) => choice.externalPostId));
  const unknown = selected.filter((id) => !known.has(id));
  const loading = shop.isPending || commented.isPending;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Posts</legend>
      <p className="text-sm text-text-muted">
        Leave all unticked to answer comments on every post of your Page and Instagram account.
      </p>
      {loading && (
        <p role="status" className="text-sm text-text-muted">
          Loading your posts…
        </p>
      )}
      {!loading && choices.length === 0 && unknown.length === 0 && (
        <p className="text-sm text-text-muted">
          No posts yet. Posts show here after you publish one or a customer comments on it.
        </p>
      )}
      <ul className="max-h-64 overflow-y-auto">
        {choices.map((choice) => (
          <Row
            key={choice.externalPostId}
            checked={selected.includes(choice.externalPostId)}
            onToggle={() => onChange(toggleValue(selected, choice.externalPostId))}
            thumbnail={choice.photoUrl}
            title={shortCaption(choice.caption)}
          />
        ))}
        {unknown.map((id) => (
          <Row
            key={id}
            checked
            onToggle={() => onChange(toggleValue(selected, id))}
            thumbnail={null}
            title="Post no longer in the list"
            detail={id}
          />
        ))}
      </ul>
    </fieldset>
  );
}

function productDetail(product: ProductListItem) {
  return product.category ?? product.code ?? undefined;
}

export function ProductPicker({ selected, onChange }: PickerProps) {
  const [search, setSearch] = useState('');
  const products = useProductChoices(search, true);
  const items = products.data?.items ?? [];
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Products</legend>
      <p className="text-sm text-text-muted">
        Only comments on posts that show one of these products. Leave all unticked for any post.
      </p>
      <Input
        type="search"
        aria-label="Search products"
        placeholder="Search products"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {products.isError && (
        <p role="alert" className="text-sm text-danger">
          Could not load your products.
        </p>
      )}
      <ul className="max-h-64 overflow-y-auto">
        {items.map((product) => (
          <Row
            key={product.id}
            checked={selected.includes(product.id)}
            onToggle={() => onChange(toggleValue(selected, product.id))}
            thumbnail={product.photos[0]?.url}
            title={product.name}
            detail={productDetail(product)}
          />
        ))}
      </ul>
      {!products.isPending && items.length === 0 && (
        <p className="text-sm text-text-muted">No products match.</p>
      )}
      {selected.length > 0 && <p className="text-sm text-text-muted">{selected.length} selected</p>}
    </fieldset>
  );
}
