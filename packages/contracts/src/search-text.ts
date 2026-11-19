import { z } from 'zod';

export const searchText = z
  .string()
  .trim()
  .min(1)
  .refine((text) => !text.includes('\u0000'), 'Remove the null character');
