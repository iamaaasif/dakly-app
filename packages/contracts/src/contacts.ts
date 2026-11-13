export const contactSources = [
  'messenger',
  'instagram',
  'whatsapp',
  'comment',
  'order_link',
  'manual',
  'voice',
  'import',
  'shopify',
  'woocommerce',
  'pos',
] as const;
export const contactKinds = ['chat_only', 'lead', 'customer', 'not_customer'] as const;
export const notCustomerReasons = [
  'supplier',
  'courier',
  'friend_or_family',
  'job_seeker',
  'spam',
  'other',
] as const;
export const genders = ['female', 'male', 'other'] as const;
export const consentChannels = ['whatsapp', 'sms', 'messenger', 'instagram', 'email'] as const;
export const consentStatuses = ['granted', 'withdrawn'] as const;
export const consentSources = [
  'checkout',
  'chat_opt_in',
  'manual',
  'import',
  'pos',
  'store_sync',
  'opt_out_link',
  'stop_keyword',
  'page_blocked',
] as const;
// Exclusive stages from the glossary, checked top to bottom.
export const lifecycleStages = [
  'none',
  'stopped_buying',
  'best',
  'slipping_away',
  'new',
  'regulars',
  'bought_once',
] as const;
export const returnRiskLevels = ['new_customer', 'good', 'some_returns', 'high'] as const;
export const importKinds = ['customers_csv', 'pos_csv'] as const;
export const importStatuses = [
  'uploaded',
  'mapped',
  'validated',
  'importing',
  'done',
  'failed',
] as const;
export const importDuplicateModes = ['update', 'skip'] as const;
// Why staff are asked whether two contacts are one person. Only a staff merge acts on it (D27).
export const matchSuggestionReasons = [
  'same_phone',
  'same_email',
  'similar_name_and_area',
] as const;
export const matchSuggestionStatuses = ['open', 'merged', 'dismissed'] as const;
