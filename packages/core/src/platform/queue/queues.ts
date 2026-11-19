const workerQueues = {
  bulk: 'bulk',
  campaign: 'campaign',
  transactional: 'transactional',
  workflow: 'workflow',
} as const;

export const QUEUES = { ...workerQueues, inbound: 'inbound' } as const;
export const WORKER_QUEUES = Object.values(workerQueues);
export type QueueName = (typeof workerQueues)[keyof typeof workerQueues];
