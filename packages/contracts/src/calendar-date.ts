import { z } from 'zod';

export const calendarDate = z.iso
  .date()
  .refine((date) => !date.startsWith('0000-'), 'Enter a valid date');
