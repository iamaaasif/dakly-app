export const conversationStatuses = ['open', 'needs_you', 'later', 'done'] as const;
export const conversationResponders = ['ai', 'human', 'paused'] as const;
export const handoverReasons = [
  'asked_for_person',
  'complaint',
  'refund',
  'discount',
  'angry',
  'out_of_scope',
  'ready_to_buy',
  'ai_unavailable',
  'allowance_used',
  'other',
] as const;
export const leadTemperatures = ['hot', 'warm', 'cold'] as const;
export const messageDirections = ['in', 'out'] as const;
export const messageAuthorTypes = ['customer', 'ai', 'user', 'system'] as const;
export const messageKinds = [
  'text',
  'image',
  'voice',
  'video',
  'file',
  'product_card',
  'order_card',
  'payment_link',
  'template',
  'note',
  'system',
] as const;
export const messageStatuses = [
  'received',
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
] as const;
export const messageSourceTypes = ['chat', 'campaign', 'automation', 'transactional'] as const;
export const aiRatings = ['good', 'bad'] as const;
export const commentClassifications = ['question', 'positive', 'negative', 'spam'] as const;
export const commentStatuses = ['new', 'replied', 'needs_you', 'hidden', 'ignored'] as const;
