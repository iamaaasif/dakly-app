import { Facebook, Megaphone, MessageSquare, Package, ShoppingBag, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

import type { setupStepIds } from '@dakly/contracts/setup-checklist';

export const setupStepCopy: Record<
  (typeof setupStepIds)[number],
  { title: string; hint: string; button: string; href: string; icon: ReactNode }
> = {
  connect_facebook_page: {
    title: 'Connect your Facebook Page',
    hint: 'So Dakly can read and answer your Messenger chats.',
    button: 'Connect page',
    href: '/integrations',
    icon: <Facebook size={20} />,
  },
  teach_ai_answers: {
    title: 'Teach Dakly AI your answers',
    hint: 'Delivery charge, payment and exchange rules. Then it replies for you, day and night.',
    button: 'Teach Dakly',
    href: '/chats?agent=settings',
    icon: <Sparkles size={20} />,
  },
  add_products: {
    title: 'Add your products',
    hint: 'Prices and sizes, so Dakly quotes the right price in chats.',
    button: 'Add products',
    href: '/products',
    icon: <Package size={20} />,
  },
  chats_to_orders: {
    title: 'Turn chats into orders',
    hint: 'Create an order from a chat, so every sale is counted from the first message.',
    button: 'Open chats',
    href: '/chats',
    icon: <ShoppingBag size={20} />,
  },
  set_up_messaging: {
    title: 'Set up WhatsApp and SMS',
    hint: 'So Dakly can send messages to your customers.',
    button: 'Set up',
    href: '/integrations',
    icon: <MessageSquare size={20} />,
  },
  send_first_campaign: {
    title: 'Send your first campaign',
    hint: 'Pick a ready-made message and send it in minutes.',
    button: 'Create campaign',
    href: '/campaigns/new',
    icon: <Megaphone size={20} />,
  },
};
