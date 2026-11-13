export const productStatuses = ['active', 'hidden', 'archived'] as const;
export const stockMovementKinds = [
  'reserve',
  'release',
  'ship',
  'return',
  'adjust',
  'import',
] as const;
export const restockRequestStatuses = ['waiting', 'notified', 'cancelled'] as const;
