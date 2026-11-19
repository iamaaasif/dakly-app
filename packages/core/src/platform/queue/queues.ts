export const QUEUES = {
  inbound: 'inbound',
  bulk: 'bulk',
  campaign: 'campaign',
  transactional: 'transactional',
  workflow: 'workflow',
} as const;

export const WORKER_QUEUES = Object.values(QUEUES);
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
