export type ErrorDefinition = {
  status: number;
  message: string;
};

export type ErrorCatalog = Record<string, ErrorDefinition>;

// Services throw AppError, never HttpException. The global filter turns it into the
// { error: { code, message } } response. See docs/rules/errors.md.
export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, definition: ErrorDefinition) {
    super(definition.message);
    this.name = 'AppError';
    this.code = code;
    this.status = definition.status;
  }
}

export const PLATFORM_ERRORS = {
  VALIDATION_FAILED: { status: 400, message: 'The request is not valid' },
  STORE_REQUIRED: { status: 401, message: 'Sign in to a store to continue' },
  INTERNAL_ERROR: { status: 500, message: 'Something went wrong' },
} as const satisfies ErrorCatalog;
