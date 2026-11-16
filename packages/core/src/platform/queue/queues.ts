export const QUEUES = {
  bulk: 'bulk',
  transactional: 'transactional',
  workflow: 'workflow',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
