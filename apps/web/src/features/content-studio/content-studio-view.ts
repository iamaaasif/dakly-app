import { z } from 'zod';

export const contentStudioTabs = ['create', 'library', 'brand'] as const;
export const contentStudioTabSchema = z.enum(contentStudioTabs).catch('create');
export type ContentStudioTab = z.infer<typeof contentStudioTabSchema>;
