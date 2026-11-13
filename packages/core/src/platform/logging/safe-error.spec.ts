import { describe, expect, it } from 'vitest';
import { serializeError } from './safe-error';

describe('serializeError', () => {
  it('keeps safe diagnostics while removing arbitrary class names, codes and frame paths', () => {
    const error = new Error('private-message');
    Object.defineProperty(error, 'constructor', { value: { name: 'private-class' } });
    Object.assign(error, { code: 'private-code', cause: new Error('private-cause') });
    error.stack =
      'Error: private-message\n    at private-function (/private-path:25:3)\n    at /01712345678:01712345678:12';
    expect(serializeError(error)).toEqual({
      errorClass: 'UnknownError',
      errorCode: 'INTERNAL_ERROR',
      stack: 'at <redacted>:25:3',
    });
    expect(serializeError({ message: 'private-object' })).toEqual({
      errorClass: 'UnknownError',
      errorCode: 'INTERNAL_ERROR',
      stack: '',
    });
    const databaseError = Object.assign(new Error('private-database'), { code: '23505' });
    expect(serializeError(databaseError).errorCode).toBe('23505');
  });
});
