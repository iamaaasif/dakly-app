const errorClasses = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'URIError',
  'EvalError',
  'AggregateError',
  'DrizzleQueryError',
  'DatabaseError',
]);
const databaseCodes = new Set([
  '23505',
  '23503',
  '23502',
  '40001',
  '40P01',
  '08006',
  '57014',
  '53300',
]);

export function serializeError(error: unknown) {
  const errorClass =
    error instanceof Error && errorClasses.has(error.constructor.name)
      ? error.constructor.name
      : 'UnknownError';
  const code =
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    databaseCodes.has(error.code)
      ? error.code
      : 'INTERNAL_ERROR';
  // Even frame names and file paths can contain input. Keep only bounded source positions.
  const stack =
    error instanceof Error
      ? (error.stack ?? '')
          .split('\n')
          .slice(1, 21)
          .flatMap((frame) => {
            const position = /:(\d{1,6}):(\d{1,4})\)?$/.exec(frame);
            return position ? [`at <redacted>:${position[1]}:${position[2]}`] : [];
          })
          .join('\n')
      : '';
  return { errorClass, errorCode: code, stack };
}
