import 'reflect-metadata';
import { Body, Controller, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError, PLATFORM_ERRORS } from '../errors/app-error';
import { AppErrorFilter } from '../errors/app-error.filter';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({ name: z.string().max(3), phone: z.string().regex(/^01\d{9}$/) });

class ValidationController {
  create(input: z.infer<typeof schema>) {
    return input;
  }

  fail() {
    throw new AppError('STORE_REQUIRED', PLATFORM_ERRORS.STORE_REQUIRED);
  }
}

Controller()(ValidationController);
Post('validation')(
  ValidationController.prototype,
  'create',
  Object.getOwnPropertyDescriptor(ValidationController.prototype, 'create')!,
);
Post('business-error')(
  ValidationController.prototype,
  'fail',
  Object.getOwnPropertyDescriptor(ValidationController.prototype, 'fail')!,
);
Body(new ZodValidationPipe(schema))(ValidationController.prototype, 'create', 0);

class ValidationModule {}
Module({ controllers: [ValidationController] })(ValidationModule);

describe('ZodValidationPipe over Fastify', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(ValidationModule, new FastifyAdapter(), {
      logger: false,
    });
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns every invalid field path without submitted values', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/validation',
      payload: { name: 'private-name', phone: 'private-phone' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        fields: [
          { path: 'name', message: expect.any(String) },
          { path: 'phone', message: expect.any(String) },
        ],
      },
    });
    expect(response.body).not.toContain('private-name');
    expect(response.body).not.toContain('private-phone');
  });

  it('keeps business errors in their existing shape', async () => {
    const response = await app.inject({ method: 'POST', url: '/business-error' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'STORE_REQUIRED', message: 'Sign in to a store to continue' },
    });
  });
});
