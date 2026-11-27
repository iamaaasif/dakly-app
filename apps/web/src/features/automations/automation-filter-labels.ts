import type { ChatIntent } from '@dakly/contracts/chats';
import type { CommentIntent } from '@dakly/contracts/comments';

// Plain words for what a customer is asking, as the owner would say it.
export const chatIntentLabels: Record<ChatIntent, string> = {
  greeting: 'Saying hello',
  price: 'Asking price',
  size_or_stock: 'Asking size or stock',
  delivery: 'Asking about delivery',
  payment: 'Asking about payment',
  order: 'Wants to order',
  confirm: 'Confirming an order',
  order_status: 'Asking where the order is',
  exchange: 'Asking to exchange',
  complaint: 'Complaining',
  photo: 'Asking for photos',
  special_request: 'Special request',
  other: 'Something else',
};

export const commentIntentLabels: Record<CommentIntent, string> = {
  price: 'Asking price',
  order: 'Wants to order',
  question: 'Has a question',
};

// The intents an owner is most likely to start a flow from come first.
export const messageIntentChoices: ChatIntent[] = [
  'price',
  'order',
  'size_or_stock',
  'delivery',
  'payment',
  'photo',
  'special_request',
  'complaint',
  'order_status',
  'exchange',
  'greeting',
];
