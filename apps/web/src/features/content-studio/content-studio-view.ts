import { z } from 'zod';

import type { ContentPiece } from '@dakly/contracts/content';

export const contentStudioTabs = ['create', 'library', 'brand'] as const;
export const libraryGroups = ['all', 'social', 'messages', 'products'] as const;

// Bad values fall back to the default instead of breaking a shared link.
export const contentStudioViewSchema = z.object({
  tab: z.enum(contentStudioTabs).catch('create'),
  group: z.enum(libraryGroups).catch('all'),
  q: z.string().trim().max(100).catch(''),
});

export type ContentStudioView = z.infer<typeof contentStudioViewSchema>;
export type ContentStudioTab = ContentStudioView['tab'];
export type LibraryGroup = ContentStudioView['group'];

export const groupKinds: Record<Exclude<LibraryGroup, 'all'>, ContentPiece['kind'][]> = {
  social: ['facebook_post', 'instagram_caption'],
  messages: ['whatsapp', 'sms'],
  products: ['product_description'],
};

export function contentStudioHref(view: Partial<ContentStudioView> & { tab: ContentStudioTab }) {
  const query = new URLSearchParams();
  if (view.tab !== 'create') query.set('tab', view.tab);
  if (view.group && view.group !== 'all') query.set('group', view.group);
  if (view.q) query.set('q', view.q);
  const text = query.toString();
  return text ? `/content-studio?${text}` : '/content-studio';
}
