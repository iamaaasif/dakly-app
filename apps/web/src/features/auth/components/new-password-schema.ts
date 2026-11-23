import { z } from 'zod';

import { passwordSchema } from '@dakly/contracts/auth';

// The contract rule decides; this only words the message for the person.
export const newPasswordSchema = z.string().superRefine((value, context) => {
  if (!passwordSchema.safeParse(value).success)
    context.addIssue({
      code: 'custom',
      message: value.length < 8 ? 'Use at least 8 characters.' : 'Add at least one number.',
    });
});
