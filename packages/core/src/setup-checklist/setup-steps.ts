import type { setupStepIds } from '@dakly/contracts/setup-checklist';

type SetupStepId = (typeof setupStepIds)[number];

export function setupStepIdsFor(extensions: string[]): SetupStepId[] {
  const steps: SetupStepId[] = ['add_store_details'];
  if (extensions.includes('chats')) steps.push('connect_channel');
  if (extensions.includes('sales')) steps.push('add_products');
  return steps;
}
