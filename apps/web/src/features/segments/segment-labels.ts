import type { ConsentChannel, ContactKind, ContactSource } from '@dakly/contracts/contacts';
import type { SegmentCondition, SegmentRules } from '@dakly/contracts/segments';

type SegmentField = SegmentCondition['field'];

const fieldLabels: Record<SegmentField, string> = {
  tag: 'Tag',
  district: 'District',
  source: 'Source',
  kind: 'Customer type',
  consent: 'Marketing consent',
};

const sourceLabels: Record<ContactSource, string> = {
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
};

const kindLabels: Record<Exclude<ContactKind, 'not_customer'>, string> = {
  chat_only: 'Chat only',
  lead: 'Lead',
  customer: 'Customer',
};

const channelLabels: Record<ConsentChannel, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  messenger: 'Messenger',
  instagram: 'Instagram',
  email: 'Email',
};

const valueLabels: Partial<Record<SegmentField, Record<string, string>>> = {
  source: sourceLabels,
  kind: kindLabels,
};

export function describeRules(rules: SegmentRules): string {
  const parts = rules.conditions.map((item) =>
    'match' in item ? `(${joinConditions(item.conditions, item.match)})` : describe(item),
  );
  return parts.join(rules.match === 'all' ? ' and ' : ' or ');
}

function joinConditions(conditions: SegmentCondition[], match: SegmentRules['match']) {
  return conditions.map(describe).join(match === 'all' ? ' and ' : ' or ');
}

function describe(condition: SegmentCondition): string {
  if (condition.field === 'consent')
    return `${condition.granted ? 'agreed to' : 'not agreed to'} ${channelLabels[condition.channel]} messages`;
  const values: string[] = condition.values;
  const labels = valueLabels[condition.field];
  const shown = values.map((value) => labels?.[value] ?? value);
  const verb = condition.operator === 'is_any_of' ? 'is' : 'is not';
  return `${fieldLabels[condition.field]} ${verb} ${shown.join(', ')}`;
}

export function matchText(count: number): string {
  return `${count} ${count === 1 ? 'customer matches' : 'customers match'}`;
}
