import 'reflect-metadata';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  request as httpRequest,
  createServer as createHttpServerForEdge,
  type Server,
} from 'node:http';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { ValkeyClient } from '../platform/cache/valkey-client';
import { hashPassword } from '../platform/crypto/password';
import { DatabaseModule } from '../platform/database/database.module';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { createHttpServer } from '../platform/http/http-server';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { AdminModule } from './admin.module';
import { staffTokenHash } from './staff-tokens';

class ProxyTestModule {}
Module({ imports: [DatabaseModule, AdminModule] })(ProxyTestModule);
async function unusedPort(): Promise<number> {
  const socket = createServer();
  await new Promise<void>((done) => socket.listen(0, '127.0.0.1', done));
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('Missing test port');
  await new Promise<void>((done) => socket.close(() => done()));
  return address.port;
}

describe('Staff requests through the actual Next rewrite', () => {
  const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const clients = [2, 3].map((suffix) => `127.${randomInt(1, 250)}.${randomInt(1, 250)}.${suffix}`);
  const identities: { id: string; email: string; assertion: string }[] = [];
  let app: NestFastifyApplication;
  let next: ChildProcess;
  let apiPort: number;
  let nextPort: number;
  let edgePort: number;
  let edge: Server;
  let origin: string;
  const password = 'proxy-fixture-password';
  const send = (port: number, client: string, assertion: string, email: string, extra = {}) =>
    new Promise<{ status: number; body: string }>((done, reject) => {
      const request = httpRequest(
        {
          hostname: '127.0.0.1',
          port,
          localAddress: client,
          method: 'POST',
          path: port === apiPort ? '/admin/auth/sign-in' : '/api/admin/auth/sign-in',
          headers: {
            host: `admin.localhost:${edgePort}`,
            origin,
            'content-type': 'application/json',
            'cf-access-jwt-assertion': assertion,
            ...extra,
          },
        },
        (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (part: string) => {
            body += part;
          });
          response.on('end', () => done({ status: response.statusCode!, body }));
        },
      );
      request.on('error', reject);
      request.end(JSON.stringify({ email, password: 'wrong-password' }));
    });
  beforeAll(async () => {
    nextPort = await unusedPort();
    edge = createHttpServerForEdge((request, response) => {
      // The public edge overwrites browser-controlled forwarding fields; Next preserves them.
      const upstream = httpRequest(
        {
          hostname: '127.0.0.1',
          port: nextPort,
          path: request.url,
          method: request.method,
          headers: {
            ...request.headers,
            host: `admin.localhost:${edgePort}`,
            'x-forwarded-host': `admin.localhost:${edgePort}`,
            'x-forwarded-for': request.socket.remoteAddress!,
            'x-forwarded-proto': 'http',
          },
        },
        (result) => {
          response.writeHead(result.statusCode!, result.headers);
          result.pipe(response);
        },
      );
      upstream.on('error', () => {
        response.writeHead(502);
        response.end();
      });
      request.pipe(upstream);
    });
    await new Promise<void>((done) => edge.listen(0, '127.0.0.1', done));
    const address = edge.address();
    if (!address || typeof address === 'string') throw new Error('Missing edge port');
    edgePort = address.port;
    origin = `http://admin.localhost:${edgePort}`;
    const pair = await generateKeyPair('RS256');
    vi.stubEnv('ADMIN_ORIGIN', origin);
    vi.stubEnv('CLOUDFLARE_ACCESS_ISSUER', 'https://dakly-test.cloudflareaccess.com');
    vi.stubEnv('CLOUDFLARE_ACCESS_AUDIENCE', 'staff-app');
    vi.stubEnv(
      'CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS',
      JSON.stringify({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'proxy' }] }),
    );
    vi.stubEnv('STAFF_SESSION_SIGNING_KEY', randomBytes(32).toString('base64'));
    app = await NestFactory.create<NestFastifyApplication>(
      ProxyTestModule,
      new FastifyAdapter(createHttpServer(['127.0.0.1'])),
      { logger: false, abortOnError: false },
    );
    await registerSessionCookies(app);
    app.useGlobalFilters(new AppErrorFilter());
    await app.listen(0, '127.0.0.1');
    apiPort = Number(new URL(await app.getUrl()).port);
    const directory = resolve('../../apps/admin');
    next = spawn(
      process.execPath,
      [
        resolve(directory, 'node_modules/next/dist/bin/next'),
        'dev',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(nextPort),
      ],
      {
        cwd: directory,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          ADMIN_API_URL: `http://127.0.0.1:${apiPort}`,
        },
        stdio: 'pipe',
      },
    );
    let output = '';
    next.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });
    next.stderr?.on('data', (data: Buffer) => {
      output += data.toString();
    });
    const deadline = Date.now() + 45000;
    while (!output.includes('Ready in')) {
      if (next.exitCode !== null || Date.now() > deadline)
        throw new Error(`Next did not start: ${output}`);
      await delay(100);
    }
    for (const index of [0, 1, 2]) {
      const id = randomUUID();
      const email = `${id}@example.test`;
      const assertion = await new SignJWT({ email, type: 'app' })
        .setProtectedHeader({ alg: 'RS256', kid: 'proxy' })
        .setIssuer(process.env.CLOUDFLARE_ACCESS_ISSUER!)
        .setAudience('staff-app')
        .setSubject(id)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(pair.privateKey);
      identities.push({ id, email, assertion });
      if (index < 2)
        await database.pool.query(
          'insert into staff_users(id,email,name,role,access_subject,password_hash,enrolled_at) values($1::uuid,$2,$3,$4,$1::text,$5,now())',
          [id, email, 'Proxy fixture', 'support', await hashPassword(password)],
        );
    }
  }, 60000);
  afterAll(async () => {
    if (next && next.exitCode === null && next.signalCode === null) {
      const stopped = new Promise<void>((done) => next.once('exit', () => done()));
      next.kill('SIGTERM');
      await stopped;
    }
    if (edge) await new Promise<void>((done) => edge.close(() => done()));
    const ids = identities.map((identity) => identity.id);
    await database.pool.query('delete from staff_audit_log where staff_user_id=any($1::uuid[])', [
      ids,
    ]);
    await database.pool.query('delete from staff_users where id=any($1::uuid[])', [ids]);
    await database.pool.end();
    if (app) {
      // Remove only the two randomized loopback client buckets owned by this fixture.
      await app
        .get(ValkeyClient)
        .connection.del(...clients.map((ip) => `staff:ip:${staffTokenHash(ip).toString('hex')}`));
      await app.close();
    }
    vi.unstubAllEnvs();
  });
  it('preserves the admin hostname and gives two socket clients separate audit IPs and limits', async () => {
    for (const [index, client] of clients.entries()) {
      const identity = identities[index]!;
      const response = await send(edgePort, client, identity.assertion, identity.email);
      expect(response.status, response.body).toBe(401);
      const audit = await database.pool.query(
        'select host(ip) as ip from staff_audit_log where staff_user_id=$1',
        [identity.id],
      );
      expect(audit.rows).toEqual([{ ip: client }]);
    }
    const unknown = identities[2]!;
    for (let attempt = 1; attempt <= 30; attempt++) {
      const response = await send(edgePort, clients[0]!, unknown.assertion, unknown.email);
      expect(response.status, response.body).toBe(attempt === 30 ? 429 : 401);
    }
    expect((await send(edgePort, clients[1]!, unknown.assertion, unknown.email)).status).toBe(401);
  }, 60000);
  it('overwrites forged incoming forwarding headers at the public edge', async () => {
    const identity = identities[1]!;
    const response = await send(edgePort, clients[1]!, identity.assertion, identity.email, {
      'x-forwarded-for': clients[0],
      'x-forwarded-host': 'attacker.test',
      'x-forwarded-proto': 'https',
    });
    expect(response.status, response.body).toBe(401);
    const audit = await database.pool.query(
      'select host(ip) as ip from staff_audit_log where staff_user_id=$1',
      [identity.id],
    );
    expect(audit.rows).toEqual([{ ip: clients[1] }, { ip: clients[1] }]);
  });
  it('retains Access, actual Host and browser Origin checks across the chain', async () => {
    const identity = identities[2]!;
    expect((await send(edgePort, clients[1]!, '', identity.email)).status).toBe(403);
    expect(
      (
        await send(edgePort, clients[1]!, identity.assertion, identity.email, {
          origin: 'http://shop.localhost',
        })
      ).status,
    ).toBe(403);
    for (const host of [
      'attacker.test',
      `admin.localhost:${edgePort + 1}`,
      'admin.localhost,attacker.test',
    ]) {
      const response = await send(nextPort, clients[1]!, identity.assertion, identity.email, {
        host,
        'x-forwarded-host': `admin.localhost:${edgePort}`,
      });
      expect(response.status, response.body).toBe(403);
    }
    expect(
      (
        await send(nextPort, clients[1]!, identity.assertion, identity.email, {
          host: `ADMIN.LOCALHOST:${edgePort}`,
        })
      ).status,
    ).toBe(401);
  });
  it('does not let a direct untrusted socket forge the admin host or consume another client bucket', async () => {
    const identity = identities[0]!;
    const response = await send(apiPort, clients[1]!, identity.assertion, identity.email, {
      host: `127.0.0.1:${apiPort}`,
      'x-forwarded-host': `admin.localhost:${edgePort}`,
      'x-forwarded-for': clients[0],
      'x-forwarded-proto': 'https',
    });
    expect(response.status, response.body).toBe(403);
    const audit = await database.pool.query(
      'select host(ip) as ip from staff_audit_log where staff_user_id=$1',
      [identity.id],
    );
    expect(audit.rows).toEqual([{ ip: clients[0] }]);
    const direct = await send(apiPort, clients[1]!, identity.assertion, identity.email, {
      'x-forwarded-for': clients[0],
      'x-forwarded-host': 'attacker.test',
      'x-forwarded-proto': 'https',
    });
    expect(direct.status, direct.body).toBe(401);
    const actual = await database.pool.query(
      'select host(ip) as ip from staff_audit_log where staff_user_id=$1 order by created_at',
      [identity.id],
    );
    expect(actual.rows).toEqual([{ ip: clients[0] }, { ip: clients[1] }]);
  });
});
