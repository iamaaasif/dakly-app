import type { IncomingHttpHeaders } from 'node:http';
import { isIP } from 'node:net';

import { UnsupportedMediaTypeException, type RawBodyRequest } from '@nestjs/common';
import fastify, { type FastifyRequest } from 'fastify';

import type { ErrorResponse } from '@dakly/contracts/errors';

import { compileProxyTrust } from '../config/trusted-proxies';
import { PLATFORM_ERRORS } from '../errors/app-error';

function validHost(value: string): boolean {
  if (!/^[a-zA-Z0-9.:[\]-]+$/.test(value)) return false;
  try {
    const url = new URL(`http://${value}`);
    return url.hostname.length > 0;
  } catch {
    return false;
  }
}

function validForwardedIps(value: IncomingHttpHeaders[string]): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'string') return false;
  const addresses = value.split(',').map((ip) => ip.trim());
  return addresses.length <= 16 && addresses.every((ip) => isIP(ip) !== 0 && !ip.includes('%'));
}

function validForwarding(headers: IncomingHttpHeaders): boolean {
  const host = headers['x-forwarded-host'];
  const protocol = headers['x-forwarded-proto'];
  return (
    (host === undefined || (typeof host === 'string' && validHost(host))) &&
    (protocol === undefined || protocol === 'http' || protocol === 'https') &&
    validForwardedIps(headers['x-forwarded-for'])
  );
}

const rawJsonMediaType = 'application/vnd.dakly.raw-json';

function expectsRawJson(request: FastifyRequest): boolean {
  const { config } = request.routeOptions;
  return 'rawJson' in config && config.rawJson === true;
}

export function createHttpServer(trustedProxies: string[]) {
  const trust = compileProxyTrust(trustedProxies);
  const server = fastify({ trustProxy: trust });
  server.addHook('onRequest', async (request, reply) => {
    const headers = request.raw.headers;
    if (!trust(request.raw.socket.remoteAddress ?? '')) {
      // Fastify getters and downstream consumers must see only the direct peer's identity.
      for (const name of Object.keys(headers))
        if (name.startsWith('x-forwarded-') || name === 'forwarded' || name === 'cf-connecting-ip')
          delete headers[name];
      return;
    }
    if (!validForwarding(headers)) {
      const { status, message } = PLATFORM_ERRORS.FORWARDING_HEADERS_INVALID;
      await reply
        .code(status)
        .send({ error: { code: 'FORWARDING_HEADERS_INVALID', message } } satisfies ErrorResponse);
      return;
    }
    const host = headers['x-forwarded-host'];
    const protocol = headers['x-forwarded-proto'];
    if (typeof host === 'string')
      headers['x-forwarded-host'] = new URL(`${protocol ?? 'http'}://${host}`).host;
  });
  // Fastify still enforces the body limit before handing the exact bytes to signed callbacks.
  server.addContentTypeParser<Buffer>(
    rawJsonMediaType,
    { parseAs: 'buffer' },
    (request, body, done) => {
      if (!expectsRawJson(request)) {
        done(new UnsupportedMediaTypeException());
        return;
      }
      (request as RawBodyRequest<FastifyRequest>).rawBody = body;
      done(null, undefined);
    },
  );
  server.addHook('preParsing', (request, _reply, payload, done) => {
    if (expectsRawJson(request)) {
      const mediaType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
      if (mediaType !== 'application/json') {
        done(new UnsupportedMediaTypeException());
        return;
      }
      request.headers['content-type'] = rawJsonMediaType;
    }
    done(null, payload);
  });
  return server;
}
