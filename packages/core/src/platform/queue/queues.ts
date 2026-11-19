// Only the API queues inbound work until CHN-4 adds its worker.
export const INBOUND_QUEUE = 'inbound';

export const QUEUES = {
  bulk: 'bulk',
  campaign: 'campaign',
  transactional: 'transactional',
  workflow: 'workflow',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
