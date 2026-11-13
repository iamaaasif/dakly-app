# HTTP on Fastify

The API runs NestJS on Fastify, not Express (ADR 0004). Most NestJS tutorials, Stack Overflow answers and AI suggestions assume Express, so they are often wrong for this repo. Lint blocks the Express packages; the rules below cover what lint cannot see.

Sources: the NestJS [Fastify adapter docs](https://docs.nestjs.com/techniques/performance) and [raw body docs](https://docs.nestjs.com/faq/raw-body), and the [Infisical backend](https://github.com/Infisical/infisical/tree/main/backend/src/server), a large open-source TypeScript product on Fastify that also runs a Go sidecar.

## Do and don't

| Don't                                                     | Do                                                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `import { Request, Response } from 'express'`             | `import type { FastifyReply, FastifyRequest } from 'fastify'`                                        |
| `helmet`, `cookie-parser`, `multer`, `express-rate-limit` | `@fastify/helmet` (via `app.register`), `@fastify/cookie`, `@fastify/multipart`, `@nestjs/throttler` |
| `FileInterceptor` from `@nestjs/platform-express`         | Presigned upload straight to R2; if a file must pass through the API, `@fastify/multipart`           |
| `@Res() res` and `res.json(...)`                          | Return the value from the handler; Nest sends it                                                     |
| `res.redirect(url)` (Express order)                       | `reply.status(302).redirect(url)`                                                                    |
| `JSON.stringify(req.body)` to check a webhook signature   | `req.rawBody` (see below)                                                                            |
| Reading `X-Forwarded-For` or `CF-Connecting-IP` yourself  | `req.ip`, with `trustProxy` set to our proxies only                                                  |
| `trustProxy: true`                                        | The Cloudflare and load balancer ranges only, so a client cannot fake its IP                         |
| Raising the 1 MiB body limit for the whole app            | Raise it on the one route that needs it                                                              |
| Express-style middleware for auth or checks               | A guard or interceptor; middleware only sees the raw Node request (`req.raw`)                        |
| `supertest` and a listening port in tests                 | `app.inject()` after `app.init()`                                                                    |

## Webhook signatures need the exact bytes

Meta, bKash and Nagad sign the bytes they sent. Re-serialising the parsed body changes spacing and key order, so a valid signature fails, or a check gets skipped "to make it work".

```ts
// Wrong: these are not the bytes Meta signed.
const payload = JSON.stringify(request.body);

// Right: NestFactory.create(AppModule, adapter, { rawBody: true }) in main.ts, then:
receive(@Req() request: RawBodyRequest<FastifyRequest>) {
  const payload = request.rawBody; // Buffer
}
```

Turn on `rawBody` in `main.ts` with the first webhook route, not before. Compare signatures with `crypto.timingSafeEqual`, never `===`.

## Tests

```ts
const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
await app.init();
await app.getHttpAdapter().getInstance().ready();

const response = await app.inject({ method: 'GET', url: '/health' });
expect(response.statusCode).toBe(200);
```

## Reviewing AI-written HTTP code

Before you accept a suggestion, check its imports. Anything from `express`, `multer` or `@nestjs/platform-express` was written for Express, so rewrite it with the right-hand column above. `pnpm lint` fails on those imports.
