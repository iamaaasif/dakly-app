import { z } from 'zod';

// Bangladesh mobile numbers are stored as 01XXXXXXXXX (11 digits), the same format as the architecture doc.
const BD_MOBILE = /^01[3-9]\d{8}$/;

export const bdMobileSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, '').replace(/^(\+?88)/, ''))
  .pipe(z.string().regex(BD_MOBILE, 'Enter a valid Bangladesh mobile number'));
