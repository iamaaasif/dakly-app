import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';

import type { ErrorResponse } from '@dakly/contracts/errors';

import { ErrorReporter } from '../logging/error-reporter';
import { serializeError } from '../logging/safe-error';
import { AppError, PLATFORM_ERRORS } from './app-error';

type HttpResponse = {
  status(code: number): { send(body: ErrorResponse): void };
};

@Catch()
export class AppErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppErrorFilter.name);

  constructor(@Optional() @Inject(ErrorReporter) private readonly reporter?: ErrorReporter) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const { status, body } = this.toResponse(exception);
    // A server-side failure needs a look whatever its class, including an AppError with 5xx.
    if (status >= 500) {
      const error = serializeError(exception);
      this.logger.error({ error }, 'Request failed');
      const request = host.switchToHttp().getRequest<{ raw: { id: string } }>();
      this.reporter?.report(error, request.raw.id);
    }
    response.status(status).send(body);
  }

  private toResponse(exception: unknown): { status: number; body: ErrorResponse } {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            ...(exception.fields && { fields: exception.fields }),
          },
        },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return { status, body: errorBody(`HTTP_${status}`, exception.message) };
    }
    const { status, message } = PLATFORM_ERRORS.INTERNAL_ERROR;
    return { status, body: errorBody('INTERNAL_ERROR', message) };
  }
}

function errorBody(code: string, message: string): ErrorResponse {
  return { error: { code, message } };
}
