# Security

Dakly holds shop customers' phones and messages and connects to their payment accounts. A leak between shops or of a gateway key would end the business. Sources: the [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) level 2, the [OWASP Top 10 for LLM applications](https://genai.owasp.org/llm-top-10/), and [Infisical's](https://github.com/Infisical/infisical) handling of secrets.

## Secrets and keys

- Secrets come from the environment through `platform/config/env.ts`, parsed with zod at start-up. No `process.env` anywhere else.
- No secret in the repo, in logs, in error messages, in job payloads or in the browser. `.env.example` lists names only.
- Shop credentials (Page tokens, gateway keys, courier keys) use envelope encryption: a per-store data key encrypted by the master key, AES-256-GCM with the store id as associated data. Decrypt only at the moment of use, in the worker.
- Credentials are write-only in the UI: after saving, show "Connected" and the last 4 characters, never the value.

## Input and output

- Every input is parsed by a zod schema at the edge ([validation-and-errors.md](validation-and-errors.md)).
- Webhooks verify the signature over `request.rawBody` with `timingSafeEqual` before anything else.
- Customer messages, names, comments, uploaded files and fetched web pages are untrusted. Render them as text in the web app; label them as data in AI prompts ([ai-and-llm.md](ai-and-llm.md)).
- Fetching a URL a shop gave (knowledge pages) goes through one fetcher that blocks private and link-local addresses, follows at most 3 redirects, caps size at 5 MB and time at 10 s.
- Uploads go straight to R2 with a presigned URL limited by content type and size. Files are served from a separate domain.

## Logging personal data

Never log: tokens, keys, codes, passwords, full phone numbers, message text, addresses, payment details. Log ids instead (`contactId`, `messageId`). The logger redacts known field names as a backstop, not as the main defence ([logging.md](logging.md)).

## Rate limits

Use the atomic per-key Valkey limiter from `platform/cache/`. Auth uses per-account keys, so `@nestjs/throttler` is not installed yet. Auth-specific key selection and accounting belong to ACC-2. Planned limits: sign-in codes 5 per phone and 20 per IP per hour; public order link 5 orders per phone per day and 30 per IP per hour; API 300 requests per minute per session. Webhooks are not rate limited but are queued.

## Dependencies

- Add a dependency only when it saves real work, and say why in the PR.
- No packages with install scripts unless reviewed. Renovate keeps versions current; security updates merge within a week.

## Reporting

Security events (bad webhook signature, permission denied on another store's id, repeated failed codes, admin access) are logged with `event: 'security'` and alert in production.
