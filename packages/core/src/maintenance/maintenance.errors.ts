import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const MAINTENANCE_ERRORS = {
  // Writes to audit_log, ai_runs and tracked_link_visits fail once the months run out.
  MAINTENANCE_PARTITIONS_MISSING: {
    status: 500,
    message: 'Fewer than two future partitions exist',
  },
  MAINTENANCE_STEPS_FAILED: { status: 500, message: 'Daily maintenance did not finish' },
} as const satisfies ErrorCatalog;

export function maintenanceError(code: keyof typeof MAINTENANCE_ERRORS): AppError {
  return new AppError(code, MAINTENANCE_ERRORS[code]);
}
