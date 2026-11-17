export const QUEUES = {
  bulk: 'bulk',
  campaign: 'campaign',
  transactional: 'transactional',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
