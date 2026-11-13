import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { ErrorResponse } from '@dakly/contracts/errors';
import { AppError, PLATFORM_ERRORS } from './app-error';

type HttpResponse = {
  status(code: number): { send(body: ErrorResponse): void };
};

@Catch()
export class AppErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const { status, body } = this.toResponse(exception);
    response.status(status).send(body);
  }

  private toResponse(exception: unknown): { status: number; body: ErrorResponse } {
    if (exception instanceof AppError) {
      return { status: exception.status, body: errorBody(exception.code, exception.message) };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return { status, body: errorBody(`HTTP_${status}`, exception.message) };
    }
    this.logger.error(exception);
    const { status, message } = PLATFORM_ERRORS.INTERNAL_ERROR;
    return { status, body: errorBody('INTERNAL_ERROR', message) };
  }
}

function errorBody(code: string, message: string): ErrorResponse {
  return { error: { code, message } };
}
