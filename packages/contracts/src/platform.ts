export const actorTypes = ['user', 'ai', 'system', 'staff', 'customer'] as const;
export const notificationCategories = [
  'fix_now',
  'sell_more',
  'activity',
  'billing',
  'security',
] as const;
export const notificationStatuses = ['new', 'seen', 'done', 'snoozed'] as const;
export const webhookProviders = ['meta', 'whatsapp', 'sms', 'sendgrid'] as const;
export const webhookEventStatuses = ['received', 'processed', 'ignored', 'failed'] as const;
export const filePurposes = [
  'product_image',
  'post_media',
  'knowledge_file',
  'logo',
  'import',
  'export',
  'sms_sender_document',
] as const;
export const fileStatuses = ['pending', 'ready', 'rejected'] as const;
export const taskSources = ['manual', 'automation', 'ai'] as const;
export const taskStatuses = ['open', 'done', 'cancelled'] as const;
