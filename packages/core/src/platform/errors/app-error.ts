import type { ValidationField } from '@dakly/contracts/errors';

export type ErrorDefinition = {
  status: number;
  message: string;
};

export type ErrorCatalog = Record<string, ErrorDefinition>;

// Services throw AppError, never HttpException. The global filter turns it into the
// { error: { code, message } } response. See docs/rules/validation-and-errors.md.
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: ValidationField[];

  constructor(code: string, definition: ErrorDefinition, fields?: ValidationField[]) {
    super(definition.message);
    this.name = 'AppError';
    this.code = code;
    this.status = definition.status;
    this.fields = fields;
  }
}

export const PLATFORM_ERRORS = {
  AUTH_REQUIRED: { status: 401, message: 'Sign in to continue' },
  ORIGIN_REJECTED: { status: 403, message: 'Request origin is not allowed' },
  VALIDATION_FAILED: { status: 400, message: 'The request is not valid' },
  FORWARDING_HEADERS_INVALID: { status: 400, message: 'Invalid proxy forwarding headers' },
  PERMISSION_DENIED: { status: 403, message: 'You do not have permission to do this' },
  STORE_REQUIRED: { status: 401, message: 'Sign in to a store to continue' },
  INTERNAL_ERROR: { status: 500, message: 'Something went wrong' },
  STORE_TRANSACTION_REQUIRED: { status: 500, message: 'Something went wrong' },
  EVENT_STORE_MISMATCH: { status: 500, message: 'Something went wrong' },
} as const satisfies ErrorCatalog;
