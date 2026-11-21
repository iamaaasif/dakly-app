import { z } from 'zod';

// A Dhaka calendar day; omitted means today.
export const aiCostQuerySchema = z.strictObject({ day: z.iso.date().optional() });
export type AiCostQuery = z.infer<typeof aiCostQuerySchema>;

export type ProviderHealthRow = {
  provider: string;
  hourAttempts: number;
  hourFailures: number;
  dayAttempts: number;
  dayFailures: number;
  averageLatencyMsLastHour: number | null;
};
export type ProviderHealthResponse = { generatedAt: string; providers: ProviderHealthRow[] };

export type AiCostShop = {
  storeId: string;
  name: string;
  runs: number;
  failedRuns: number;
  costMicroUsd: number;
  overCeiling: boolean;
};
export type AiCostResponse = {
  day: string;
  ceilingMicroUsd: number | null;
  totalMicroUsd: number;
  shops: AiCostShop[];
};
