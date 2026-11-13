export const automationStatuses = ['draft', 'active', 'paused', 'archived'] as const;
export const automationRunStatuses = ['waiting', 'running', 'done', 'exited', 'failed'] as const;
export const automationStepKinds = [
  'trigger',
  'wait',
  'condition',
  'random',
  'send',
  'action',
  'goal',
  'exit',
] as const;
