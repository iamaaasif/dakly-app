import { MessageSquare, Send, ShoppingBag, Store, type LucideIcon } from 'lucide-react';

export type ExtensionCard = {
  name: 'sales' | 'chats' | 'physical_shop' | 'social_auto_post';
  title: string;
  description: string;
  adds: string;
  href: string;
  icon: LucideIcon;
};

export const extensionCards: ExtensionCard[] = [
  {
    name: 'sales',
    title: 'Sales',
    description:
      'Orders and Products. Track every order from inquiry to delivery, with stock that updates itself.',
    adds: 'Orders · Products',
    href: '/orders',
    icon: ShoppingBag,
  },
  {
    name: 'chats',
    title: 'Chats',
    description:
      'Messenger, WhatsApp and Instagram in one inbox. Dakly suggests replies and turns chats into orders and leads.',
    adds: 'Chats',
    href: '/chats',
    icon: MessageSquare,
  },
  {
    name: 'physical_shop',
    title: 'Physical Shop',
    description: 'Shop sales and Due book. Sell at the counter in seconds and keep track of baki.',
    adds: 'Due book',
    href: '/due-book',
    icon: Store,
  },
  {
    name: 'social_auto_post',
    title: 'Social Auto Post',
    description:
      'Plan, write and schedule Facebook and Instagram posts. Dakly posts at the best time.',
    adds: 'Social hub · My posts',
    href: '/social',
    icon: Send,
  },
];
