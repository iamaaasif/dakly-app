import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serializeError } from './safe-error';

describe('serializeError', () => {
  it('keeps the driver code from a wrapped PostgreSQL error', () => {
    const error = new Error('query failed', { cause: { code: '23505' } });
    expect(serializeError(error).errorCode).toBe('23505');
  });

  it('keeps paths at the repository root', () => {
    const error = new Error('failed');
    error.stack = `Error: failed\n    at check (${resolve(__dirname, '../../../../../scripts/check-docs.mjs')}:12:4)`;
    expect(serializeError(error).stack).toBe('at check (scripts/check-docs.mjs:12:4)');
  });

  it.each([
    ['packages/core/src/auth/users.repository.ts', 'packages/core/src/auth/users.repository.ts'],
    [
      '/home/private/dakly-app/packages/core/src/auth/users.repository.ts',
      'packages/core/src/auth/users.repository.ts',
    ],
    ['/srv/build/node_modules/pg/lib/client.js', 'node_modules/pg/lib/client.js'],
  ])('keeps the function and relative path from %s', (path, relative) => {
    const error = new Error('query failed');
    error.stack = `Error: query failed\n    at UsersRepository.create (${path}:25:3)`;
    expect(serializeError(error).stack).toBe(`at UsersRepository.create (${relative}:25:3)`);
  });

  it.each(['private otp:123456:12', '    at private otp:123456:12'])(
    'removes the complete multiline message before parsing frames: %s',
    (messageLine) => {
      const error = new Error(`private message\n${messageLine}`);
      error.stack = `Error: private message\n${messageLine}\n    at safe-frame (/application.ts:25:3)`;
      expect(serializeError(error).stack).toBe('at safe-frame (application.ts:25:3)');
    },
  );

  it('keeps safe diagnostics while removing arbitrary class names, codes and absolute prefixes', () => {
    const error = new Error('private-message');
    Object.defineProperty(error, 'constructor', { value: { name: 'private-class' } });
    Object.assign(error, { code: 'private-code', cause: new Error('private-cause') });
    error.stack =
      'Error: private-message\n    at private-function (/private-path:25:3)\n    at /01712345678:01712345678:12';
    expect(serializeError(error)).toEqual({
      errorClass: 'UnknownError',
      errorCode: 'INTERNAL_ERROR',
      stack: 'at private-function (private-path:25:3)',
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
