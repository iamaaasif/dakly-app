export const QUEUES = {
  bulk: 'bulk',
  campaign: 'campaign',
  transactional: 'transactional',
  workflow: 'workflow',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
