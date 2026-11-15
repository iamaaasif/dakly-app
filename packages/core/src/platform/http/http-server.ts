import { isIP } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';
import fastify from 'fastify';
import { compileProxyTrust } from '../config/trusted-proxies';

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
      await reply.code(400).send({ message: 'Invalid proxy forwarding headers' });
      return;
    }
    const host = headers['x-forwarded-host'];
    const protocol = headers['x-forwarded-proto'];
    if (typeof host === 'string')
      headers['x-forwarded-host'] = new URL(`${protocol ?? 'http'}://${host}`).host;
  });
  return server;
}
