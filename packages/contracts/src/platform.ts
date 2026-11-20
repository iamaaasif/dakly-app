export const actorTypes = ['user', 'ai', 'system', 'staff', 'customer'] as const;
export const notificationCategories = [
  'fix_now',
  'sell_more',
  'activity',
  'billing',
  'security',
] as const;
export const notificationStatuses = ['new', 'seen', 'done', 'snoozed'] as const;
export const webhookProviders = [
  'meta',
  'whatsapp',
  'sms',
  'sendgrid',
  'bkash',
  'nagad',
  'city_bank',
] as const;
export const webhookEventStatuses = ['received', 'processed', 'ignored', 'failed'] as const;
export const filePurposes = [
  'product_image',
  'post_media',
  'knowledge_file',
  'logo',
  'import',
  'export',
  'sms_sender_document',
  'data_export',
  'staff_export',
  'settlement_report',
] as const;
export const fileStatuses = ['pending', 'ready', 'rejected'] as const;
export const taskSources = ['manual', 'automation', 'ai'] as const;
export const taskStatuses = ['open', 'done', 'cancelled'] as const;
// Daily rollups the maintenance job builds; raw rows are dropped only behind their watermark.
export const maintenanceRollups = ['tracked_link_visit_days', 'ai_run_daily_metrics'] as const;
export const dataRequestKinds = ['store_export', 'store_delete', 'contact_delete'] as const;
export const dataRequestStatuses = ['open', 'in_progress', 'done', 'rejected'] as const;
