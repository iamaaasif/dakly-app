import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadEnv } from '@dakly/core/platform/config/env';
import { AppErrorFilter } from '@dakly/core/platform/errors/app-error.filter';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new AppErrorFilter());
  app.enableShutdownHooks();
  await app.listen(env.API_PORT);
}

void bootstrap();
