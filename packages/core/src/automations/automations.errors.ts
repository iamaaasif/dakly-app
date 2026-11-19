import { MAX_AUTOMATIONS_PER_STORE } from '@dakly/contracts/automations';
import type { ValidationField } from '@dakly/contracts/errors';

import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const AUTOMATION_ERRORS = {
  AUTOMATION_NOT_FOUND: { status: 404, message: 'Workflow not found' },
  AUTOMATION_APPROVAL_DENIED: {
    status: 403,
    message: 'Only an owner or admin can publish or enable workflows in this shop',
  },
  AUTOMATION_VERSION_NOT_FOUND: { status: 404, message: 'Workflow version not found' },
  AUTOMATION_LIMIT_REACHED: {
    status: 409,
    message: `A store can have at most ${MAX_AUTOMATIONS_PER_STORE} workflows`,
  },
  AUTOMATION_STATUS_NOT_ALLOWED: { status: 409, message: 'The workflow cannot do this now' },
  AUTOMATION_PAUSED_BY_SYSTEM: {
    status: 409,
    message: 'This workflow resumes on its own once SMS credits are topped up',
  },
  AUTOMATION_VERSION_IS_CURRENT: {
    status: 409,
    message: 'This is the published version. Pause the workflow to stop it.',
  },
  AUTOMATION_CHANNEL_UNREACHABLE: {
    status: 409,
    message: 'A message step has no channel the store can send on',
  },
  AUTOMATION_ACTION_UNAVAILABLE: {
    status: 409,
    message: 'The store does not have this action yet',
  },
  AUTOMATION_TAPS_UNAVAILABLE: {
    status: 409,
    message: 'Taps on workflow messages are not recorded yet',
  },
  AUTOMATION_REVIEW_UNAVAILABLE: {
    status: 409,
    message: 'Review before sending is not available yet',
  },
  AUTOMATION_SPLIT_TOO_SOON: {
    status: 409,
    message: 'Wait at least 2 hours before a split on taps or replies',
  },
  AUTOMATION_TRIGGER_UNAVAILABLE: {
    status: 409,
    message: 'The store does not have this trigger yet',
  },
} as const satisfies ErrorCatalog;

type AutomationErrorCode = keyof typeof AUTOMATION_ERRORS;

export function automationError(code: AutomationErrorCode, fields?: ValidationField[]): AppError {
  return new AppError(code, AUTOMATION_ERRORS[code], fields);
}
