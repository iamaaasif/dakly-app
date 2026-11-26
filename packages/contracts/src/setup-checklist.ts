import { z } from 'zod';

export const setupStepIds = ['add_store_details', 'connect_channel', 'add_products'] as const;

export const changeSetupChecklistSchema = z.strictObject({ hidden: z.literal(true) });
export type ChangeSetupChecklistInput = z.infer<typeof changeSetupChecklistSchema>;

export type SetupChecklistResponse = {
  hidden: boolean;
  steps: { id: (typeof setupStepIds)[number]; done: boolean }[];
};
