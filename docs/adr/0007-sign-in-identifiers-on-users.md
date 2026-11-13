# 0007: Sign-in identifiers on users, codes in Valkey

- Status: proposed
- Date: 2026-11-13

## Context

Release 1 sign-in takes a code by SMS or email, phone and password, email and password, and Google. The spec had an identities table and an OTP challenges table. A person has at most one phone, one email and one Google account for Dakly.

## Decision

`users` holds `phone`, `email`, `phone_verified_at`, `email_verified_at`, `password_hash` and `google_subject`, each identifier unique. A CHECK requires a phone or an email; Google sign-in always provides an email. Sign-in codes are short-lived and live in Valkey with a TTL and attempt counter, hashed; they are not rows. Sessions store only a hash of the token.

## Consequences

One row to read at sign-in and no join. Adding a fourth provider (Apple, Facebook) means a new unique column, or a `user_identities` table if several more are added. Losing Valkey loses only codes in flight, which users ask for again.
