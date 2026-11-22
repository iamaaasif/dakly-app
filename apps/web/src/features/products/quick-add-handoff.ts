import { z } from 'zod';

// More details carries what was typed in the quick add to the full page through the address.
const handoffSchema = z.object({
  name: z.string().trim().max(200).catch(''),
  price: z
    .string()
    .regex(/^\d+(?:\.\d{1,2})?$/)
    .catch(''),
  stock: z
    .string()
    .regex(/^\d{1,9}$/)
    .catch(''),
});

export type QuickAddHandoff = z.infer<typeof handoffSchema>;

export function quickAddHandoffHref(values: QuickAddHandoff) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  const search = params.toString();
  return search ? `/products/new?${search}` : '/products/new';
}

export function parseQuickAddHandoff(raw: Record<string, string | string[] | undefined>) {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return handoffSchema.parse({
    name: first(raw.name) ?? '',
    price: first(raw.price) ?? '',
    stock: first(raw.stock) ?? '',
  });
}
