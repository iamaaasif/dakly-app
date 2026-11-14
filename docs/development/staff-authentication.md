# Staff authentication operations

ADM-1 supplies `apps/admin`, staff password and passkey or TOTP enrollment, sign-in and sign-out. The authenticated entry screen shows the current staff identity and role. Business screens and staff lifecycle management remain later tasks.

## Deployment

Set `ADMIN_ORIGIN` to the admin app's exact HTTPS origin. It must differ from `WEB_ORIGINS`. Set `CLOUDFLARE_ACCESS_ISSUER` to the configured team origin, for example `https://your-team.cloudflareaccess.com`, and `CLOUDFLARE_ACCESS_AUDIENCE` to the application's audience. The verifier uses only that issuer's `/cdn-cgi/access/certs` endpoint and accepts RS256 human application assertions with email and subject. Restrict the Access policy to the staff identity provider; service tokens do not authenticate staff.

Generate a dedicated random 32-byte key and supply its base64 encoding as `STAFF_SESSION_SIGNING_KEY`. Keep it separate from encryption master keys. Changing it ends all staff sessions. Configure the existing encryption variables for TOTP envelopes. Production refuses missing staff verification configuration, HTTP admin origins and development verification keys.

Route `/api/admin/*` on the admin origin to `/admin/*` on the Nest API, preserving the admin Host and Cloudflare assertion. Do not expose an unrestricted origin. Configure trusted proxy ranges before relying on remote IP limits; never trust arbitrary forwarded headers. The Next rewrite defaults to localhost port 4000 for local development. `ADMIN_API_URL` controls the rewrite destination at build time and server-side session checks at runtime. The Next app verifies Access on pages and assets as well as API traffic; the Nest guard verifies it again. Browser writes require the exact admin Origin.

## Provisioning

Only an operator with access to the trusted application host can run the provisioning command. There is no HTTP provisioning or staff signup endpoint. Do not put a password, TOTP secret or private passkey in the provisioning input.

1. Verify the employee and their Cloudflare Access subject through the configured identity provider and the operator's staff onboarding process. Establish their company email, personal emails and phone for conflict checks. These contacts are operator-attested evidence, not OTP-verified contact ownership. Do not collect or store an NID.
2. Prepare an owner-readable JSON file outside the repository containing `operatorIdentity`, `email`, `name`, `role`, `accessSubject`, `phone`, `personalEmails` and a `reason` of at least ten characters. Use a named operator identity from the privileged host's operational records. The allowed roles are in the admin contract. Company and personal emails are normalized and bounded; the phone uses the shared Bangladesh mobile schema.
3. After building packages, run `node packages/core/dist/admin/provision-staff.js /secure/input.json /secure/new-proof.json` with the application database environment. The output path must not already exist. The command creates it with mode 0600 and never prints the proof.
4. Deliver the proof privately to the employee. They open `/enroll` through Cloudflare Access, enter the proof, choose a password and register either a passkey with user verification or an authenticator code. The proof expires after 24 hours; the factor ceremony expires after five minutes. A session starts only after factor verification succeeds.
5. Remove the input and proof files according to the operator's secure handling procedure. If a pending enrollment is abandoned, rerun the command for the same Access subject and email. It invalidates previous challenges and issues a new proof, preserving the original staff role and attested contacts. It refuses already-enrolled or disabled accounts. This is enrollment recovery, not a general staff credential reset.

Provisioning and renewal write an audit row in the same staff transaction. Operator events use `operator_identity`, with a null `staff_user_id`; the target staff id remains `target_id`. A database constraint requires exactly one actor representation. Operator attribution rests on trusted host access and its records, not on a claim that the employee performed the provisioning. Browser authentication events use the verified staff actor.

## Session and failure behavior

Staff JWTs use a separate host-only HttpOnly cookie, a dedicated signing key and a persisted token hash. Each request reads current session, status and role from PostgreSQL. Sessions expire at eight hours, or thirty minutes after their last request. Completing sign-in revokes previous sessions and consumes outstanding challenges under a staff row lock. Signing out also invalidates pending sign-in challenges. A database trigger invalidates sessions and challenges in the same transaction when staff status changes to disabled; enabling the row later cannot revive them. Future lifecycle services still owe their own staff audit before changing status. Five wrong password or factor attempts share a fifteen-minute lock; IP attempts are bounded to thirty per hour. Successful password verification alone does not reset failures.

Staff transaction scopes cannot nest with account or store scopes. Authentication changes and audit inserts use the same staff transaction; an audit failure rolls back the action. Later account or shop operations must add explicit audit methods that join their own transaction, rather than nesting a staff transaction.

`staff_identity_contacts` records the operator-attested phone, company email and personal emails. It indexes kind and normalized value for the forthcoming conflict and any-staff-account checks. The browser cannot change those contacts. Staff passkeys use their own credential table and counters; the old JSON column is retained for compatibility and is not read or populated by this implementation. The normalized table is the sole source for new passkey credentials. Existing staff rows without the new enrollment state cannot authenticate. The tool does not claim an existing email whose Access subject is missing; any legacy conversion requires an explicit operator migration backed by verified identity evidence. Existing sessions without activity timestamps are rejected.

## Local verification

Local development still verifies signatures. Supply an explicit public RSA JWKS in `CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS`, with the configured issuer and audience, and send a short-lived signed human assertion in `Cf-Access-Jwt-Assertion`. Keep its private key outside the repository. There is no fake-success driver. Production rejects this setting. The integration suite creates ephemeral signing keys and actual WebAuthn signatures and uses a dedicated database and Redis database.

Live Cloudflare policy, identity provider enrollment, network routing and hardware passkey behavior require staging verification. Local cryptographic tests do not establish those deployment properties. Daily audit sealing and audit browsing remain ADM-2; authentication already writes append-only audit rows.
