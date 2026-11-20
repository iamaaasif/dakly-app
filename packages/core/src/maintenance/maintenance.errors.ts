import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const MAINTENANCE_ERRORS = {
  // Writes to audit_log, ai_runs and tracked_link_visits fail once the months run out.
  MAINTENANCE_PARTITIONS_MISSING: {
    status: 500,
    message: 'Fewer than two future partitions exist',
  },
  MAINTENANCE_ARCHIVE_INCOMPLETE: {
    status: 500,
    message: 'An audit archive object was not stored completely',
  },
  MAINTENANCE_ARCHIVE_COUNT_CHANGED: {
    status: 500,
    message: 'An audit month changed while it was archived',
  },
  MAINTENANCE_STEPS_FAILED: { status: 500, message: 'Daily maintenance did not finish' },
} as const satisfies ErrorCatalog;

export function maintenanceError(code: keyof typeof MAINTENANCE_ERRORS): AppError {
  return new AppError(code, MAINTENANCE_ERRORS[code]);
}
