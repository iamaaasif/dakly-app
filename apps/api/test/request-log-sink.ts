import type { INestApplicationContext } from '@nestjs/common';
import { PARAMS_PROVIDER_TOKEN, type Params } from 'nestjs-pino';
import { onTestFailed } from 'vitest';

import { requestLoggingOptions } from '@dakly/core/platform/logging/request-logging';

export function captureRequestLogs(app: INestApplicationContext) {
  const params = app.get<Params>(PARAMS_PROVIDER_TOKEN);
  const original = params.pinoHttp;
  const messages: string[] = [];
  // Keep production serializers and request context; change only this test app's destination.
  params.pinoHttp = [requestLoggingOptions(), { write: (message) => messages.push(message) }];
  return {
    beginTest() {
      messages.length = 0;
      onTestFailed(() => {
        process.stderr.write(messages.join(''));
      });
    },
    restore() {
      params.pinoHttp = original;
    },
  };
}
