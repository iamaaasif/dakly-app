import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const AI_ERRORS = {
  AI_PAUSED: { status: 503, message: 'AI is paused' },
  AI_STORE_BUSY: { status: 503, message: 'The store has three AI calls in progress' },
  AI_INSIDE_TRANSACTION: { status: 500, message: 'AI calls need a closed database transaction' },
  AI_CONFIG_INVALID: { status: 500, message: 'AI model pricing is missing or invalid' },
  AI_DRIVER_REQUIRED: { status: 500, message: 'Production AI requires the OpenAI driver' },
} as const satisfies ErrorCatalog;

export function aiError(code: keyof typeof AI_ERRORS): AppError {
  return new AppError(code, AI_ERRORS[code]);
}
