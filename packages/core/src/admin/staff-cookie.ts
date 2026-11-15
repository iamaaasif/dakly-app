import type { FastifyReply } from 'fastify';

import { loadEnv } from '../platform/config/env';
import { STAFF_SESSION_TTL_MS } from './staff-session-policy';

export const STAFF_COOKIE = 'dakly_staff';
export function staffCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(STAFF_COOKIE, token, {
    httpOnly: true,
    secure: loadEnv().NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: STAFF_SESSION_TTL_MS / 1000,
  });
  reply.header('Cache-Control', 'no-store');
}
export function clearStaffCookie(reply: FastifyReply): void {
  reply.clearCookie(STAFF_COOKIE, {
    httpOnly: true,
    secure: loadEnv().NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
}
