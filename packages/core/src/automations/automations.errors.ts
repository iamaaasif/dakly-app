import { MAX_AUTOMATIONS_PER_STORE } from '@dakly/contracts/automations';

import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const AUTOMATION_ERRORS = {
  AUTOMATION_NOT_FOUND: { status: 404, message: 'Workflow not found' },
  AUTOMATION_LIMIT_REACHED: {
    status: 409,
    message: `A store can have at most ${MAX_AUTOMATIONS_PER_STORE} workflows`,
  },
} as const satisfies ErrorCatalog;

type AutomationErrorCode = keyof typeof AUTOMATION_ERRORS;

export function automationError(code: AutomationErrorCode): AppError {
  return new AppError(code, AUTOMATION_ERRORS[code]);
}
