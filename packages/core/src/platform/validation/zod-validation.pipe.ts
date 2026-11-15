import { type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppError, PLATFORM_ERRORS } from '../errors/app-error';

// Usage: @Body(new ZodValidationPipe(createCustomerSchema)) input: CreateCustomerInput
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fields = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      throw new AppError('VALIDATION_FAILED', PLATFORM_ERRORS.VALIDATION_FAILED, fields);
    }
    return result.data;
  }
}
