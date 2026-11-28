import type { ConsentChannel, ContactKind, ContactSource } from '@dakly/contracts/contacts';
import {
  MAX_SEGMENT_CONDITIONS,
  type SegmentCondition,
  type SegmentInnerGroup,
  type SegmentRules,
} from '@dakly/contracts/segments';

export type SegmentField = SegmentCondition['field'];
// Picked customers are added from the customer list, so the builder does not offer them.
export type BuilderField = Exclude<SegmentField, 'contact'>;

export const fieldLabels: Record<BuilderField, string> = {
  tag: 'Tag',
  district: 'District',
  source: 'Source',
  kind: 'Customer type',
  total_spent: 'Total spent',
  order_count: 'Orders placed',
  consent: 'Marketing consent',
};

export const sourceLabels: Record<ContactSource, string> = {
  messenger: 'Messenger',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  comment: 'Comment',
  order_link: 'Order link',
  manual: 'Added by hand',
  voice: 'Added by voice',
  import: 'Import',
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  pos: 'Shop counter',
  khata_import: 'Khata import',
};

export const kindLabels: Record<Exclude<ContactKind, 'not_customer'>, string> = {
  chat_only: 'Chat only',
  lead: 'Lead',
  customer: 'Customer',
};

export const channelLabels: Record<ConsentChannel, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  messenger: 'Messenger',
  instagram: 'Instagram',
  email: 'Email',
};

export const amountOperatorLabels = [
  ['at_least', 'at least'],
  ['at_most', 'at most'],
] as const;

export function newCondition(field: BuilderField): SegmentCondition {
  if (field === 'total_spent') return { field, operator: 'at_least', amountPoisha: 100_000 };
  if (field === 'order_count') return { field, operator: 'at_least', count: 2 };
  if (field === 'consent') return { field, channel: 'sms', granted: true };
  if (field === 'source') return { field, operator: 'is_any_of', values: ['messenger'] };
  if (field === 'kind') return { field, operator: 'is_any_of', values: ['customer'] };
  return { field, operator: 'is_any_of', values: [''] };
}

export function newGroup(): SegmentInnerGroup {
  return { match: 'all', conditions: [newCondition('tag')] };
}

function countConditions(rules: SegmentRules): number {
  return rules.conditions.reduce(
    (total, item) => total + ('match' in item ? item.conditions.length : 1),
    0,
  );
}

export const canAddCondition = (rules: SegmentRules) =>
  countConditions(rules) < MAX_SEGMENT_CONDITIONS;

// The builder shows only groups. Conditions saved loose at the top become one group that matches
// the same way as the top, which selects the same people.
export function groupLooseConditions(rules: SegmentRules): SegmentRules {
  const loose = rules.conditions.filter((item): item is SegmentCondition => !('match' in item));
  if (!loose.length) return rules;
  const wrapped: SegmentInnerGroup = { match: rules.match, conditions: loose };
  let placed = false;
  const conditions = rules.conditions.flatMap((item) => {
    if ('match' in item) return [item];
    if (placed) return [];
    placed = true;
    return [wrapped];
  });
  return { ...rules, conditions };
}
