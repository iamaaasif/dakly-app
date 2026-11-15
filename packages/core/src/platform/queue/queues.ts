export const QUEUES = { bulk: 'bulk', transactional: 'transactional' } as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
