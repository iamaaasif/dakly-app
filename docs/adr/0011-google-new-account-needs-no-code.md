# 0011: A new Google account needs no email code

- Status: accepted
- Date: 2026-11-21

## Context

ADR 0010 asks for a fresh email code for every Google address that is not Gmail or
Workspace. That protects an existing account from takeover after a mailbox changes
hands. When no account has the address, there is nothing to take over, yet the code
was still required. Decision D48 says Google sign-up needs nothing extra.

## Decision

The code is required only when a non-Gmail, non-Workspace Google address matches an
existing verified account that would be linked. Without a verified owner, the account
is created at once with the Google address as its verified email. The rest of ADR 0010
is unchanged.

## Consequences

A former owner of a recycled third-party address could register it first. The real
owner then cannot use it for another account, but cannot be signed in to this one
either, because Google sign-in is bound to the Google subject. Gmail and Workspace
addresses are unaffected.
