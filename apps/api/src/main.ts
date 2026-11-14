import 'reflect-metadata';
import { createHttpServer } from '@dakly/core/platform/http/http-server';
import { registerSessionCookies } from '@dakly/core/platform/http/session-cookie';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { loadEnv } from '@dakly/core/platform/config/env';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

// Fastify over Express: about 3x the throughput on webhook intake. See ADR 0004.
async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(createHttpServer(env.API_TRUSTED_PROXIES)),
    {
      bufferLogs: true,
    },
  );
  await registerSessionCookies(app);
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  // Fastify listens on localhost only unless told otherwise; the Droplet needs all interfaces.
  await app.listen(env.API_PORT, '0.0.0.0');
}

void bootstrap();
