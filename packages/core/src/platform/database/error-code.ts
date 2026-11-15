export function databaseErrorCode(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = 'code' in error ? error.code : undefined;
  const cause = 'cause' in error ? error.cause : undefined;
  return (
    code ??
    (typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined)
  );
}
