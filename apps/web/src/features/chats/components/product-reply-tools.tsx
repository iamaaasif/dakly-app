'use client';
import { Link2, ShoppingBag } from 'lucide-react';
import { useState } from 'react';

import { formatMoney } from '@dakly/contracts/money';
import type { ProductResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@dakly/ui/popover';
import { QueryError } from '@dakly/ui/query-error';

import { useOrderLink, useProductSearch, useSendProduct } from '../api/reply-tools';
import { useSessionContext } from '@/lib/session-context';

type Tool = 'product' | 'link';

const tools = {
  product: {
    label: 'Send product',
    icon: ShoppingBag,
    offers: (product: ProductResponse) => product.isVisibleInChats,
  },
  link: {
    label: 'Order link',
    icon: Link2,
    offers: (product: ProductResponse) => product.isVisibleInOrderLink,
  },
} as const;

type ProductReplyToolsProps = {
  conversationId: string;
  disabled: boolean;
  onOrderLink: (url: string) => void;
};

// Picking a product needs the product list, so members without product access see neither tool.
export function ProductReplyTools({
  conversationId,
  disabled,
  onOrderLink,
}: ProductReplyToolsProps) {
  const { data: session } = useSessionContext();
  const sendProduct = useSendProduct(conversationId);
  const orderLink = useOrderLink();
  if (!session?.currentStore?.canViewProducts) return null;
  return (
    <>
      <ProductTool
        tool="product"
        disabled={disabled}
        pending={sendProduct.isPending}
        error={sendProduct.error?.message}
        onPick={(productId, close) => sendProduct.mutate(productId, { onSuccess: close })}
      />
      <ProductTool
        tool="link"
        disabled={disabled}
        pending={orderLink.isPending}
        error={orderLink.error?.message}
        onPick={(productId, close) =>
          orderLink.mutate(productId, {
            onSuccess: (url) => {
              onOrderLink(url);
              close();
            },
          })
        }
      />
    </>
  );
}

type ProductToolProps = {
  tool: Tool;
  disabled: boolean;
  pending: boolean;
  error: string | undefined;
  onPick: (productId: string, close: () => void) => void;
};

function ProductTool({ tool, disabled, pending, error, onPick }: ProductToolProps) {
  const [open, setOpen] = useState(false);
  const { label, icon: Icon } = tools[tool];
  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" type="button" disabled={disabled} size="sm">
          <Icon aria-hidden="true" size={16} />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-2">
        <ProductChoices
          tool={tool}
          pending={pending}
          onPick={(productId) => onPick(productId, () => setOpen(false))}
        />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

type ProductChoicesProps = {
  tool: Tool;
  pending: boolean;
  onPick: (productId: string) => void;
};

function ProductChoices({ tool, pending, onPick }: ProductChoicesProps) {
  const [search, setSearch] = useState('');
  const products = useProductSearch(search.trim());
  const { label, offers } = tools[tool];
  const items = (products.data?.items ?? []).filter(
    (product) => product.status === 'active' && offers(product),
  );
  return (
    <>
      <Input
        aria-label={`Search products for ${label}`}
        placeholder="Search products"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {products.error ? (
        <QueryError
          message={products.error.message}
          onRetry={() => void products.refetch()}
          retryLabel="Retry products"
        />
      ) : null}
      {products.isPending ? <p className="p-2 text-text-muted">Loading products</p> : null}
      {products.data && !items.length ? (
        <p className="p-2 text-text-muted">No products to choose.</p>
      ) : null}
      <div role="menu" aria-label={label} className="max-h-64 overflow-y-auto">
        {items.map((product) => (
          <button
            key={product.id}
            type="button"
            role="menuitem"
            disabled={pending}
            className="flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left hover:bg-surface-muted disabled:opacity-60"
            onClick={() => onPick(product.id)}
          >
            <span className="min-w-0 truncate font-semibold">{product.name}</span>
            <span className="shrink-0 text-sm text-text-muted">
              {formatMoney(product.pricePoisha)}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
