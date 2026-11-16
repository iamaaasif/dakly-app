export function databaseErrorCode(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = 'code' in error ? error.code : undefined;
  const cause = 'cause' in error ? error.cause : undefined;
  return (
    code ??
    (typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined)
  );
}

// Drizzle wraps the driver error, so the constraint name sits on the cause when there is one.
export function isConstraintViolation(error: unknown, code: string, constraint: string): boolean {
  const cause = error instanceof Error && error.cause ? error.cause : error;
  return (
    databaseErrorCode(error) === code &&
    typeof cause === 'object' &&
    cause !== null &&
    'constraint' in cause &&
    cause.constraint === constraint
  );
}
