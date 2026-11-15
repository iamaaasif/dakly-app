# 0009: Only verified email reserves a sign-in identity

- Status: accepted
- Date: 2026-11-14

## Context

ADR 0007 keeps sign-in identifiers on the user row. Signup accepts an optional
unverified email. Unconditional email uniqueness lets someone reserve another
person's address by typing it, preventing its owner from adding it later.

## Decision

Email remains on `users`. Its case-insensitive unique index covers only rows with
`email_verified_at` set. Unverified values may repeat and are never used for
sign-in or account linking. Verified email lookup always filters on verification.
Phone and Google subject uniqueness remain unchanged.

## Consequences

Only proof of address control can reserve an email identity. Concurrent email
verification has one winner; the other attempt returns `AUTH_EMAIL_TAKEN`.
Existing users are never merged, adopted or cleared during verification. Email
changes still need fresh proof from an existing method plus new-address proof.
