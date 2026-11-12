import { type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppError, PLATFORM_ERRORS } from '../errors/app-error';

// Usage: @Body(new ZodValidationPipe(createCustomerSchema)) input: CreateCustomerInput
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      throw new AppError('VALIDATION_FAILED', {
        status: PLATFORM_ERRORS.VALIDATION_FAILED.status,
        message: firstIssue?.message ?? PLATFORM_ERRORS.VALIDATION_FAILED.message,
      });
    }
    return result.data;
  }
}
