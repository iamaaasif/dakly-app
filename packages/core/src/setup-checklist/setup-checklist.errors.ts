import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const SETUP_CHECKLIST_ERRORS = {
  SETUP_STEPS_OPEN: { status: 409, message: 'Finish the setup steps before hiding the guide' },
} as const satisfies ErrorCatalog;
export function setupChecklistError(code: keyof typeof SETUP_CHECKLIST_ERRORS): AppError {
  return new AppError(code, SETUP_CHECKLIST_ERRORS[code]);
}
