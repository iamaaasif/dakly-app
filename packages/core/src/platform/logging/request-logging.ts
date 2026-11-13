import { randomUUID } from 'node:crypto';
import type { Options } from 'pino-http';
import { serializeError } from './safe-error';

const sensitiveFields = [
  'phone',
  'email',
  'password',
  'code',
  'token',
  'cookie',
  'cookies',
  'authorization',
];

export function requestLoggingOptions(): Options {
  const requestIds = new WeakMap<object, string>();
  return {
    level: 'info',
    customProps: (request, response) => {
      let requestId = requestIds.get(request);
      if (!requestId) {
        requestId = randomUUID();
        requestIds.set(request, requestId);
        request.id = requestId;
        response.setHeader('X-Request-Id', requestId);
      }
      return { requestId };
    },
    wrapSerializers: false,
    serializers: {
      req: () => ({}),
      res: (response: { statusCode: number }) => ({ statusCode: response.statusCode }),
      err: serializeError,
    },
    redact: sensitiveFields.flatMap((field) => [field, `*.${field}`, `*.*.${field}`]),
    customLogLevel: (_request, response) => (response.statusCode >= 400 ? 'warn' : 'info'),
    customErrorObject: (_request, response, _error, value: { responseTime: number }) => ({
      res: { statusCode: response.statusCode },
      responseTime: value.responseTime,
    }),
    customSuccessMessage: () => 'Request completed',
    customErrorMessage: () => 'Request completed',
  };
}
