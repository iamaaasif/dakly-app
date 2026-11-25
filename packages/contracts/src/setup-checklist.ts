import { z } from 'zod';

import { howYouSellOptions } from './stores';

export const setupStepIds = ['add_store_details', 'connect_channel', 'add_products'] as const;

export const howYouSellAnswersSchema = z
  .array(z.enum(howYouSellOptions))
  .min(1, 'Choose at least one way you sell')
  .max(4)
  .refine((values) => new Set(values).size === values.length, 'Choose each answer once');

export const changeSetupChecklistSchema = z
  .strictObject({
    howYouSell: howYouSellAnswersSchema.optional(),
    hidden: z.literal(true).optional(),
  })
  .refine(
    ({ howYouSell, hidden }) => (howYouSell === undefined) !== (hidden === undefined),
    'Change the answers or hide the guide, not both',
  );
export type ChangeSetupChecklistInput = z.infer<typeof changeSetupChecklistSchema>;

export type SetupChecklistResponse = {
  howYouSell: (typeof howYouSellOptions)[number][];
  hidden: boolean;
  steps: { id: (typeof setupStepIds)[number]; done: boolean }[];
  // Extensions this change turned on, for the toast; empty when nothing changed.
  turnedOn: string[];
};
