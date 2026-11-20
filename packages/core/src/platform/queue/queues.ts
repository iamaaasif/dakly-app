export const QUEUES = {
  inbound: 'inbound',
  aiReply: 'ai-reply',
  outbound: 'outbound',
  sync: 'sync',
  bulk: 'bulk',
  campaign: 'campaign',
  transactional: 'transactional',
  workflow: 'workflow',
  payments: 'payments',
} as const;

export const WORKER_QUEUES = Object.values(QUEUES);
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
