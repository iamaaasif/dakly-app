# 0010: Require fresh proof for Google email outside its authority

- Status: accepted
- Date: 2026-11-14

## Context

ACC-R4 links Google identities by verified email. Google documents that an
`email_verified` claim can refer to old ownership of a third-party address.
Google is authoritative for Gmail addresses, or verified Workspace addresses
with an `hd` claim. Automatically linking any other address could take over an
existing account after that mailbox changes hands.

Source: [Google ID token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Decision

An existing Google subject remains the primary sign-in identity. For an unmatched
subject, a Google-verified Gmail or Workspace address can establish email ownership.
Other addresses need a fresh code sent to that exact mailbox before linking or
before a signup ticket can carry a verified email. No address domain is permanently
excluded.

The email challenge binds its subject, email, expected verified owner (or absence)
and the owner's verification timestamp. A changed binding requires a new flow;
completion never retargets the challenge to another user. Linking rechecks current
ownership under the account lock, preserves unique Google subjects, and uses the
common disabled-account and TOTP gates.

## Consequences

`POST /auth/google` can return `email_verification_required` with an opaque ticket.
`POST /auth/google/email/verify` accepts that ticket and its code, then signs in or
returns a separate signup ticket. Signup still requires a verified mobile number.
Tickets are single use and expire after fifteen minutes; email codes expire after
ten minutes. Consumed proof is not restored after a database failure. Restarting
the Google flow obtains fresh proof without weakening the original binding.
