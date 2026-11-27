import { Facebook, Instagram, MessageCircle, Package, Store } from 'lucide-react';
import type { ReactNode } from 'react';

import type { setupStepIds } from '@dakly/contracts/setup-checklist';

type StepId = (typeof setupStepIds)[number];

export const setupStepCopy: Record<
  StepId,
  { title: string; hint: string; button: string; href: string; preview: ReactNode }
> = {
  add_store_details: {
    title: 'Add store details',
    hint: 'Your store name appears in chats, receipts and order links.',
    button: 'Add store details',
    href: '/settings?tab=store',
    preview: <StorePreview />,
  },
  connect_channel: {
    title: 'Connect a channel',
    hint: 'Bring your customer chats into Dakly so AI can reply for you.',
    button: 'Connect a channel',
    href: '/integrations',
    preview: <ChannelsPreview />,
  },
  add_products: {
    title: 'Create your first product',
    hint: 'Add prices and sizes once. Dakly uses them in chats and orders.',
    button: 'Create your first product',
    href: '/products/new',
    preview: <ProductPreview />,
  },
};

function StorePreview() {
  return (
    <>
      <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface p-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-control bg-inverse text-on-primary">
          <Store size={16} />
        </span>
        <div>
          <p className="text-sm font-semibold">Your store</p>
          <p className="text-xs text-text-muted">Name, category and location</p>
        </div>
      </div>
      <ul className="space-y-1.5 px-1.5 text-xs text-text-muted">
        {['Store name', 'Business type', 'District'].map((label) => (
          <li key={label} className="flex items-center gap-2">
            <span className="size-3 rounded-full border border-dashed border-border-strong" />
            {label}
          </li>
        ))}
      </ul>
    </>
  );
}

const channels = [
  { title: 'WhatsApp', hint: 'Coming soon', icon: MessageCircle, color: 'text-success' },
  {
    title: 'Facebook Messenger',
    hint: 'Chats and post comments',
    icon: Facebook,
    color: 'text-info',
  },
  { title: 'Instagram', hint: 'Direct messages', icon: Instagram, color: 'text-ai' },
];

function ChannelsPreview() {
  return (
    <ul className="flex flex-col gap-2">
      {channels.map(({ title, hint, icon: Icon, color }) => (
        <li key={title} className="flex items-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-surface">
            <Icon size={15} className={color} />
          </span>
          <div>
            <p className="text-sm leading-tight font-semibold">{title}</p>
            <p className="text-xs text-text-muted">{hint}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ProductPreview() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="relative grid h-16 w-24 place-items-center">
        <div className="shadow-xs absolute top-3 left-1 size-13 -rotate-10 rounded-lg border border-border bg-surface" />
        <div className="shadow-xs relative grid size-15 place-items-center rounded-lg border border-border bg-surface p-1.5">
          <span className="grid size-full place-items-center rounded-md bg-surface-muted text-text-muted">
            <Package size={21} strokeWidth={1.5} />
          </span>
        </div>
      </div>
      <p className="text-sm font-semibold">Your products</p>
      <p className="max-w-44 text-xs text-text-muted">Add a product with a price and sizes.</p>
    </div>
  );
}
