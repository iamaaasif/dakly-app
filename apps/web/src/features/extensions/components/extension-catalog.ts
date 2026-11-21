import { MessageSquare, Send, ShoppingBag, Store, type LucideIcon } from 'lucide-react';

type ExtensionName = 'sales' | 'chats' | 'physical_shop' | 'social_auto_post';

export type ExtensionCard = {
  name: ExtensionName;
  title: string;
  description: string;
  adds: string;
  href: string;
  icon: LucideIcon;
  // Physical Shop arrives in release 2, so its switch stays off and locked.
  comingSoon?: boolean;
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
    adds: 'Shop sales · Due book',
    href: '/extensions',
    icon: Store,
    comingSoon: true,
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
