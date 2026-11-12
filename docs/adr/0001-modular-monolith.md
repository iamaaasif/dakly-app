# 0001: Modular monolith

- Status: accepted
- Date: 2026-11-12

## Context

Dakly is a new product with a small team. It must scale later, but reaching millions of users will take years. Microservices would add deploys, network failures and data consistency work on day one.

## Decision

One NestJS codebase, deployed as two processes: `api` (HTTP and webhooks) and `worker` (jobs). Code is split into feature modules with enforced boundaries (`docs/rules/module-boundaries.md`), so a module can later move to its own service without a rewrite.

## Consequences

Simple local dev, one deploy, transactions across features. Boundaries must be enforced by lint, not goodwill. First candidates to split out, only when their trigger is hit: webhook intake, then AI reply workers.
