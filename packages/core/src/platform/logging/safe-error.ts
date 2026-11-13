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
  if (!(error instanceof Error)) {
    return { errorClass: 'UnknownError', errorCode: 'INTERNAL_ERROR', stack: '' };
  }
  const errorClass = errorClasses.has(error.constructor.name)
    ? error.constructor.name
    : 'UnknownError';
  const code =
    'code' in error && typeof error.code === 'string' && databaseCodes.has(error.code)
      ? error.code
      : 'INTERNAL_ERROR';
  // Messages can contain newlines and forged frames. Parse only after the full error header.
  const header = `${Error.prototype.toString.call(error)}\n`;
  const stack = error.stack?.startsWith(header)
    ? error.stack
        .slice(header.length)
        .split('\n')
        .slice(0, 20)
        .flatMap((frame) => {
          const position = /^\s+at .+:(\d{1,6}):(\d{1,4})\)?$/.exec(frame);
          return position ? [`at <redacted>:${position[1]}:${position[2]}`] : [];
        })
        .join('\n')
    : '';
  return { errorClass, errorCode: code, stack };
}
