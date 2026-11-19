import { randomUUID } from 'node:crypto';

import type { OnApplicationShutdown } from '@nestjs/common';
import {
  ServerRuntimeClient,
  createTransport,
  type ServerRuntimeClientOptions,
} from '@sentry/core';

import type { serializeError } from './safe-error';

type Transport = ServerRuntimeClientOptions['transport'];

const sentryTransport: Transport = (options) =>
  createTransport(options, async (request) => {
    const response = await fetch(options.url, {
      method: 'POST',
      body: request.body,
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      signal: AbortSignal.timeout(2000),
    });
    return {
      statusCode: response.status,
      headers: {
        'x-sentry-rate-limits': response.headers.get('x-sentry-rate-limits'),
        'retry-after': response.headers.get('retry-after'),
      },
    };
  });

export class ErrorReporter implements OnApplicationShutdown {
  private readonly client?: ServerRuntimeClient;

  constructor(dsn?: string, transport: Transport = sentryTransport) {
    if (dsn) {
      // Disable automatic instrumentation; only the filter reports errors.
      this.client = new ServerRuntimeClient({
        dsn,
        transport,
        stackParser: () => [],
        integrations: [],
        sendDefaultPii: false,
      });
    }
  }

  report(error: ReturnType<typeof serializeError>, requestId: string): void {
    this.send(error, { requestId }, 'Request failed');
  }

  reportJob(
    error: ReturnType<typeof serializeError>,
    jobId: string,
    step?: { runId: string; stepKey: string },
  ): void {
    this.send(error, { jobId, ...step }, 'Job failed');
  }

  private send(
    error: ReturnType<typeof serializeError>,
    context: { requestId: string } | { jobId: string; runId?: string; stepKey?: string },
    message: string,
  ): void {
    // captureEvent enriches events with global users and breadcrumbs, even without integrations.
    this.client?.sendEvent({
      event_id: randomUUID().replaceAll('-', ''),
      timestamp: Date.now() / 1000,
      level: 'error',
      message,
      tags: { ...context, errorClass: error.errorClass, errorCode: error.errorCode },
      extra: { error },
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client?.close(2000);
  }
}
