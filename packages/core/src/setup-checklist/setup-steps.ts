import type { setupStepIds } from '@dakly/contracts/setup-checklist';
import type { howYouSellOptions } from '@dakly/contracts/stores';

type SetupStepId = (typeof setupStepIds)[number];
type HowYouSell = (typeof howYouSellOptions)[number];

// Shopify, WooCommerce and POS connections do not exist in release 1 (D6, D21), and the
// counter-sale steps arrive with Physical Shop, so those answers add no steps yet.
const stepsByAnswer: Partial<Record<HowYouSell, { id: SetupStepId; extension: string }[]>> = {
  social_media: [
    { id: 'connect_facebook_page', extension: 'chats' },
    { id: 'teach_ai_answers', extension: 'chats' },
    { id: 'add_products', extension: 'sales' },
    { id: 'chats_to_orders', extension: 'chats' },
  ],
};

// A step whose extension is off is left out: its page is hidden from the menu.
export function setupStepIdsFor(howYouSell: HowYouSell[], extensions: string[]): SetupStepId[] {
  const own = howYouSell
    .flatMap((answer) => stepsByAnswer[answer] ?? [])
    .filter(({ extension }) => extensions.includes(extension))
    .map(({ id }) => id);
  return [...new Set([...own, 'set_up_messaging', 'send_first_campaign'] as SetupStepId[])];
}
