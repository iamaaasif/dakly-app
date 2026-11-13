import fastifyCookie from '@fastify/cookie';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyReply } from 'fastify';
import { loadEnv } from '../platform/config/env';

export const SESSION_COOKIE = 'dakly_session';

export async function registerSessionCookies(app: NestFastifyApplication): Promise<void> {
  await app.register(fastifyCookie);
}

export function setSessionCookie(reply: FastifyReply, token: string, isRemembered: boolean): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: loadEnv().NODE_ENV !== 'development',
    sameSite: 'lax',
    path: '/',
    ...(isRemembered ? { maxAge: 30 * 24 * 60 * 60 } : {}),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: loadEnv().NODE_ENV !== 'development',
    sameSite: 'lax',
    path: '/',
  });
}
