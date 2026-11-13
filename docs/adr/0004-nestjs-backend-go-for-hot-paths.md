# 0004: NestJS for the backend, Go only for named hot paths

- Status: accepted
- Date: 2026-11-12

## Context

Before any feature work, we compared Go with NestJS for the whole backend ([comparison](https://claude.ai/artifact/VGnaAtpWsHWBysNQewHRnN)). On one CPU core, a Meta webhook handler (HMAC check, push to Redis) served 33.5k requests a second in Go, 17.0k in NestJS on Fastify and 5.9k in NestJS on Express. Even at 100,000 shops, webhook intake on Express needs about one core. At 1,000 shops the servers cost about 0.1% of the OpenAI bill, so speed does not decide the language. One language with the Next.js app does matter, because every feature crosses that boundary.

## Decision

The backend stays NestJS (TypeScript). Go is used only for a hot path that hits a named trigger, as its own small service, never for business rules.

The first and only candidate is webhook intake: receive, check the signature, drop duplicates, store the raw event and return 200. Move it to Go when either happens:

- intake uses more than half of one CPU core for a sustained period (about 8,000 events a second on Fastify), or
- Meta reports webhook delivery failures caused by slow responses.

To keep that move small, intake hands events on through a Postgres table or a Redis Stream that a NestJS worker reads, not straight into BullMQ, which has no Go client. AI reply workers stay in TypeScript: they wait on OpenAI, so Go would not make them faster.

The API runs on Fastify instead of Express (about 3x the throughput in the same test). New npm versions wait 3 days before install (`minimumReleaseAge`), because a smaller dependency tree was Go's main security advantage.

## Consequences

One language from database to UI and shared zod types. Express-only middleware cannot be used; use the `@fastify/*` equivalent. A Go service adds a second toolchain to CI, so add one only when the trigger is hit. Revisit this ADR if the core work becomes CPU-bound, such as running models ourselves.
