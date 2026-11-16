# API routes

Planned release 1 HTTP routes, by feature, with the permission each needs. This is an implementation contract, not a list of endpoints already served. The rules are in [api-design.md](../rules/api-design.md) and [auth-and-permissions.md](../rules/auth-and-permissions.md). The request and response shapes are zod schemas in `packages/contracts/src/<feature>.ts`, written in each feature's contract step; an OpenAPI file can be generated from them when an outside client needs one.

Permission areas (No access / View / Edit, feature 01): `customers`, `chats`, `orders`, `products`, `campaigns`, `automations`, `socialPosts`, `analytics`, `storeSettings`, `billing`, `team`. A `GET` needs `<area>.view`, anything else `<area>.edit`, unless the table says otherwise. Lists take `cursor` and `limit` and return `{ items, nextCursor }`. Creates take an `Idempotency-Key` header where the table marks "idem".

Merge requests carry a stable operation key through all retries, including retries after undo. The server records the key before queueing or uses an atomic outbox handoff; a repeated key returns the original operation outcome.

## Without a store session

| Route                                                             | Notes                                                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `POST /auth/code`                                                 | Send a sign-in code by SMS or email; rate limited per target and IP                            |
| `POST /auth/code/verify`                                          | Sign in or sign up with the code                                                               |
| `POST /auth/email/code`, `POST /auth/email/code/verify`           | Public, allowed origin; sign in through verified email                                         |
| `POST /me/email/proof`, `POST /me/email`, `POST /me/email/verify` | Signed-in user, allowed origin; existing-phone or password proof then new-address verification |
| `POST /me/password/proof`, `POST /me/password`                    | Signed-in user, allowed origin; fresh code or current password                                 |
| `POST /auth/password`                                             | Sign in with phone or email and password                                                       |
| `POST /auth/google`                                               | Sign in with a Google ID token                                                                 |
| `POST /auth/google/email/verify`                                  | Confirm fresh mailbox ownership for a pending Google identity                                  |
| `POST /auth/password-reset`, `POST /auth/password-reset/confirm`  | By code                                                                                        |
| `POST /auth/sign-out`                                             | Ends the session                                                                               |
| `GET /me`, `PATCH /me`                                            | Profile, sign-in methods                                                                       |
| `GET /me/stores`, `POST /me/active-store`                         | Store switcher (`stores_for_user`)                                                             |
| `POST /stores`                                                    | Create a store (sign-up step)                                                                  |
| `POST /invites/accept`                                            | Accept a team invite by token                                                                  |
| `POST /webhooks/meta`, `POST /webhooks/whatsapp`                  | Signature checked against `req.rawBody`                                                        |
| `POST /webhooks/payments/:gateway`                                | Gateway notifications                                                                          |
| `GET /payments/callback/:gateway`                                 | Customer returns from the gateway                                                              |
| `GET /public/stores/:storeSlug/order-link/:shortCode`             | Order and payment page for the customer                                                        |
| `POST /public/stores/:storeSlug/order-link/:shortCode/confirm`    | Customer confirms an order                                                                     |
| `GET /l/:code`                                                    | Tracked link redirect                                                                          |
| `GET /l/s/:code`, `POST /l/s/:code`                               | SMS opt-out page, and the tap that withdraws SMS consent                                       |

### Account security routes (ACC-7)

All writes require an allowed browser origin. `/me` routes require a verified
session; `/auth/totp` routes are public and validate their proofs or opaque tokens.
First-factor sign-in endpoints return 204 with the session cookie after full
success, or 202 `{ status: "totp_required", challengeId }` without a cookie.

| Route                               | Input and response                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /me/sessions`                  | Optional `before` UUID; `{ items, nextCursor }`, up to 100 active devices                        |
| `DELETE /me/sessions/:sessionId`    | Owned UUID; 204, clears the cookie when deleting the current session                             |
| `POST /me/sessions/sign-out-others` | 204; retains only the current session                                                            |
| `POST /me/totp/proof`               | 204; sends a fresh setup proof code                                                              |
| `POST /me/totp/setup`               | `{ currentPassword }` or `{ proofCode }`; 200 `{ setupId, uri }`                                 |
| `POST /me/totp/confirm`             | `{ setupId, code }`; 200 `{ backupCodes }`, ten codes shown once                                 |
| `POST /me/totp/disable`             | `{ code }`, authenticator or backup code; 204                                                    |
| `POST /auth/totp`                   | `{ challengeId, code }`; 204 with a session cookie only after verification                       |
| `POST /auth/totp/recovery/code`     | `{ phone, method: "phone" or "email" }`; 204                                                     |
| `POST /auth/totp/recovery`          | `{ phone, phoneCode, emailCode?, password? }`; 202 `{ recoveryId, completionToken, eligibleAt }` |
| `POST /auth/totp/recovery/cancel`   | `{ recoveryId, token }` with the cancel-link token; 204                                          |
| `POST /auth/totp/recovery/complete` | `{ recoveryId, token }` with the separate completion token; 204, no session                      |

`eligibleAt` is null until required notices are accepted. Completion returns
`409 AUTH_RECOVERY_PENDING` until seven days after acceptance. The completion token
is returned once; cancel links never authorize completion. More than 1000 distinct
store Owners gives `409 AUTH_RECOVERY_OWNER_LIMIT` before recovery state changes;
an Owner without verified contact gives `409 AUTH_RECOVERY_CONTACT_REQUIRED`.
The cancellation page at `/security/recovery#recoveryId=…&cancelToken=…` is built
in ACC-8. It must parse the fragment locally and require an explicit POST action.
`GET /me` adds `hasPassword`, `isPhoneVerified`, `isEmailVerified` and
`isTotpEnabled`; hashes, secrets and proof state are never returned.

## Store and team (01)

| Route                                                                                                                                                          | Permission      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `GET /store`, `PATCH /store`                                                                                                                                   | `storeSettings` |
| `PATCH /store/extensions`                                                                                                                                      | Owner or Admin  |
| `GET /store/setup-checklist`                                                                                                                                   | any member      |
| `GET /members`, `POST /members/invites`, `POST /members/invites/:membershipId/resend`, `PATCH /members/:membershipId`, `DELETE /members/:membershipId`         | `team`          |
| `GET /roles`, `POST /roles`, `PATCH /roles/:roleId`, `DELETE /roles/:roleId`                                                                                   | `team`          |
| `GET /audit-log`                                                                                                                                               | Owner           |
| `GET /support-grants`, `POST /support-grants/:supportGrantId/approve`, `POST /support-grants/:supportGrantId/deny`, `POST /support-grants/:supportGrantId/end` | Owner           |

Team invite creation uses the pending recipient and role as its retry identity instead
of an `Idempotency-Key` header. Matching retries return the pending invite without sending;
resend is explicit. See [account and team](../features/01-account-and-team.md).

## Channels (02)

| Route                                                                                                          | Permission      |
| -------------------------------------------------------------------------------------------------------------- | --------------- |
| `GET /channel-connections`                                                                                     | `storeSettings` |
| `POST /channel-connections/meta`, `POST /channel-connections/whatsapp`                                         | `storeSettings` |
| `POST /channel-connections/:channelConnectionId/reconnect`, `DELETE /channel-connections/:channelConnectionId` | `storeSettings` |
| `PATCH /channel-connections/:channelConnectionId/ai`                                                           | `chats`         |
| `GET /sms-sender-ids`, `POST /sms-sender-ids`, `POST /sms-sender-ids/:smsSenderIdId/test`                      | `storeSettings` |

Store settings: `GET /store` requires `storeSettings.view`, and `PATCH /store`
requires `storeSettings.edit`. Both return `StoreSettingsResponse`. Settings
patches preserve omitted fields and clear optional fields with `null`; name
cannot be cleared. BIN uses `vatBin` (13 digits), and the trade licence uses
`tradeLicenceNumber`. `sending` holds quiet hours, the frequency cap and `onlyOwnersAndAdminsApprove` (feature 09) and is saved whole; changing `onlyOwnersAndAdminsApprove` also requires Owner or Admin. Empty or unknown input is rejected.
`PATCH /store/extensions` accepts `{ extensions: [...] }` as the complete
selection of `chats`, `sales` and `social_auto_post`, including an empty array.
It returns the updated settings and requires Owner or Admin through the team
policy; custom settings grants do not permit this action. Core stays implicit,
and Physical Shop is excluded in release 1. Both writes audit field names
atomically and retain business data when an extension is disabled.

## Customers and segments (03)

| Route                                                                                                      | Permission                                                       |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /contacts`, `GET /contacts/:contactId`                                                                | `customers` (phones masked unless "See full phone numbers")      |
| `POST /contacts`, `PATCH /contacts/:contactId`, `DELETE /contacts/:contactId`                              | `customers`                                                      |
| `GET /contacts/:contactId/timeline`                                                                        | `customers`                                                      |
| `GET /contacts/:contactId/memory`, `PUT /contacts/:contactId/memory`, `DELETE /contacts/:contactId/memory` | View with `customers.view`; edit and clear with `customers.edit` |
| `POST /contacts/:contactId/merge` (idem; closes the suggestion)                                            | `customers`                                                      |
| `GET /contact-merges`, `POST /contact-merges/:contactMergeId/undo` (within 7 days, D29)                    | `customers`                                                      |
| `GET /contact-match-suggestions`, `POST /contact-match-suggestions/:suggestionId/dismiss`                  | `customers`                                                      |
| `POST /contacts/:contactId/consents`                                                                       | `customers`                                                      |
| `POST /imports`, `PATCH /imports/:importId`, `POST /imports/:importId/start`, `GET /imports/:importId`     | `customers`                                                      |
| `POST /contacts/exports`                                                                                   | `customers` + "Download customer lists"                          |
| `GET /segments`, `POST /segments/preview` (count only)                                                     | `segments.view`                                                  |
| `POST /segments`, `PATCH /segments/:segmentId`, `DELETE /segments/:segmentId`                              | `segments.edit`                                                  |
| `GET /tasks`, `POST /tasks`, `PATCH /tasks/:taskId`                                                        | `customers`                                                      |

## Chats and AI agent (04)

| Route                                                                                                                                  | Permission                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `GET /conversations`, `GET /conversations/:conversationId`, `GET /conversations/:conversationId/messages`                              | `chats`                                                           |
| `POST /conversations/:conversationId/messages` (idem)                                                                                  | `chats`                                                           |
| `PATCH /conversations/:conversationId` (status, assignee)                                                                              | `chats`                                                           |
| `POST /conversations/:conversationId/take-over`, `POST /conversations/:conversationId/return-to-ai`                                    | `chats`                                                           |
| `POST /messages/:messageId/rating`                                                                                                     | `chats`                                                           |
| `GET /comments`, `POST /comments/:socialCommentId/reply`, `POST /comments/:socialCommentId/hide`                                       | `chats`                                                           |
| `GET /saved-replies`, `POST /saved-replies`, `PATCH /saved-replies/:savedReplyId`, `DELETE /saved-replies/:savedReplyId`               | `chats`                                                           |
| `GET /ai-agent`, `PATCH /ai-agent`, `POST /ai-agent/rules/parse`, `POST /ai-agent/test`, `POST /ai-agent/go-live`                      | `chats`                                                           |
| `GET /ai-agent/changes`, `POST /ai-agent/changes/:aiRuleChangeId/undo`                                                                 | Owner or Admin                                                    |
| `GET /knowledge-items`, `POST /knowledge-items`, `PATCH /knowledge-items/:knowledgeItemId`, `DELETE /knowledge-items/:knowledgeItemId` | `chats`                                                           |
| `GET /events/stream`                                                                                                                   | any member; Server-Sent Events for new messages and notifications |

## Products and stock (05)

| Route                                                                                           | Permission |
| ----------------------------------------------------------------------------------------------- | ---------- |
| `GET /products`, `GET /products/:productId`                                                     | `products` |
| `POST /products` (idem), `PATCH /products/:productId`, `DELETE /products/:productId` (archives) | `products` |
| `POST /products/:productId/variants`, `PATCH /variants/:variantId`                              | `products` |
| `POST /variants/:variantId/stock-adjustments`                                                   | `products` |
| `GET /variants/:variantId/stock-movements`                                                      | `products` |
| `GET /restock-requests`                                                                         | `products` |

## Orders and delivery (06)

| Route                                                                                                                            | Permission      |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `GET /orders`, `GET /orders/:orderId`, `GET /orders/:orderId/timeline`                                                           | `orders`        |
| `POST /orders` (idem), `PATCH /orders/:orderId`                                                                                  | `orders`        |
| `POST /orders/:orderId/stage` (to, reason, follow-up date)                                                                       | `orders`        |
| `POST /orders/:orderId/courier` (courier name, tracking code)                                                                    | `orders`        |
| `POST /orders/:orderId/cod-collected`                                                                                            | `orders`        |
| `GET /orders/return-risk?phone=`                                                                                                 | `orders`        |
| `POST /orders/bulk-stage`                                                                                                        | `orders`        |
| `GET /delivery-zones`, `POST /delivery-zones`, `PATCH /delivery-zones/:deliveryZoneId`, `DELETE /delivery-zones/:deliveryZoneId` | `storeSettings` |
| `GET /areas?parentId=`                                                                                                           | any member      |

## Payments and billing (07)

| Route                                                                                                             | Permission             |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `GET /payment-gateways`, `PUT /payment-gateways/:gateway`, `DELETE /payment-gateways/:gateway`                    | `storeSettings`        |
| `POST /orders/:orderId/payment-intents` (idem)                                                                    | `orders`               |
| `POST /orders/:orderId/manual-payments` (idem)                                                                    | `orders`               |
| `GET /payment-intents`, `GET /payment-intents/:paymentIntentId`                                                   | `orders`               |
| `POST /payment-intents/:paymentIntentId/void`, `POST /payment-intents/:paymentIntentId/review`                    | `orders`               |
| `POST /payment-intents/:paymentIntentId/refunds` (idem)                                                           | `orders` + refund flag |
| `GET /billing`, `GET /billing/plans`, `GET /billing/invoices`, `GET /billing/invoices/:invoiceId`                 | `billing`              |
| `POST /billing/subscription` (change plan), `POST /billing/wallet/top-ups` (idem), `POST /billing/coupons/redeem` | `billing`              |
| `GET /billing/usage`                                                                                              | `billing`              |

## Content and social (08)

| Route                                                                                                     | Permission    |
| --------------------------------------------------------------------------------------------------------- | ------------- |
| `GET /brand-profile`, `PUT /brand-profile`                                                                | `socialPosts` |
| `GET /posts`, `GET /posts/:postId`, `POST /posts` (idem), `PATCH /posts/:postId`, `DELETE /posts/:postId` | `socialPosts` |
| `POST /posts/:postId/schedule`, `POST /posts/:postId/publish-now`, `POST /posts/:postId/approve`          | `socialPosts` |
| `POST /posts/captions` (AI writing)                                                                       | `socialPosts` |
| `GET /posts/queue-slots`, `PUT /posts/queue-slots`                                                        | `socialPosts` |

## Campaigns and automations (09)

| Route                                                                                                                                       | Permission    |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `GET /campaigns`, `GET /campaigns/:campaignId`, `GET /campaigns/:campaignId/estimate` (draft only), `GET /campaigns/:campaignId/recipients` | `campaigns`   |
| `POST /campaigns`, `PATCH /campaigns/:campaignId`, `DELETE /campaigns/:campaignId` (draft only)                                             | `campaigns`   |
| `POST /campaigns/:campaignId/approve` (also Owner or Admin while the store's approval setting is on)                                        | `campaigns`   |
| `POST /campaigns/:campaignId/unschedule`, `POST /campaigns/:campaignId/cancel` (scheduled, until 5 minutes before the send)                 | `campaigns`   |
| `POST /campaigns/:campaignId/pause`, `POST /campaigns/:campaignId/resume`                                                                   | `campaigns`   |
| `GET /whatsapp-templates`, `POST /whatsapp-templates`, `POST /whatsapp-templates/:templateId/submit`                                        | `campaigns`   |
| `GET /automations`, `GET /automations/:automationId`, `POST /automations`, `PATCH /automations/:automationId`                               | `automations` |
| `POST /automations/:automationId/publish`, `POST /automations/:automationId/pause`, `POST /automations/:automationId/archive`               | `automations` |
| `GET /automations/templates`, `POST /automations/templates/:templateKey/use`                                                                | `automations` |
| `GET /automations/:automationId/runs`                                                                                                       | `automations` |

`POST /campaigns/:campaignId/approve` takes no `Idempotency-Key` header: the draft row lock, `CAMPAIGN_NOT_DRAFT` (409) on a repeat and the wallet reservation key make a retry safe. A send-now route outside approval (CAMP-3) takes a real key.

## Dashboard, notifications and assistant (10)

| Route                                                                                             | Permission                                               |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `GET /dashboard`                                                                                  | any member; cards follow the member's areas              |
| `GET /notifications`, `PATCH /notifications/:notificationId`, `POST /notifications/mark-all-seen` | any member, own rows only                                |
| `POST /push-subscriptions`, `DELETE /push-subscriptions/:pushSubscriptionId`                      | any member                                               |
| `GET /assistant/threads`, `GET /assistant/threads/:threadId`, `POST /assistant/messages`          | `analytics`; answers only from areas the member can view |

## Analytics (11)

| Route                                                                                                 | Permission  |
| ----------------------------------------------------------------------------------------------------- | ----------- |
| `GET /analytics/overview`, `GET /analytics/sales`, `GET /analytics/chats`, `GET /analytics/marketing` | `analytics` |
| `POST /analytics/exports`                                                                             | `analytics` |

## Admin app (12)

On the admin hostname, staff session, passkey or TOTP required. Each route names the staff roles that may call it. Every write takes a reason and writes `staff_audit_log` first; none needs a second approver (D28).

| Route                                                                              | Staff roles                             |
| ---------------------------------------------------------------------------------- | --------------------------------------- |
| `POST /admin/auth/sign-in`, `POST /admin/auth/verify`, `POST /admin/auth/sign-out` | all                                     |
| `GET /admin/stores` (`admin_store_overview`)                                       | all                                     |
| `GET /admin/stores/:storeId/*` (store data)                                        | support, with an approved support grant |
| `POST /admin/stores/:storeId/support-grants`                                       | support                                 |
| `POST /admin/stores/:storeId/suspend`, `POST /admin/stores/:storeId/restore`       | ops                                     |
| `GET /admin/sms-sender-ids` (`open_sms_sender_ids`)                                | super_admin, ops                        |
| `POST /admin/stores/:storeId/sms-sender-ids/:smsSenderIdId/approve`, `.../reject`  | super_admin, ops                        |
| `GET /admin/plans`, `PUT /admin/plans/:planCode`                                   | finance                                 |
| `GET /admin/coupons`, `POST /admin/coupons`, `PATCH /admin/coupons/:couponId`      | finance                                 |
| `GET /admin/settings`, `PUT /admin/settings/:key`                                  | super_admin                             |
| `GET /admin/staff`, `POST /admin/staff`, `PATCH /admin/staff/:staffUserId`         | super_admin                             |
| `GET /admin/audit-log`                                                             | super_admin                             |
| `GET /admin/queues` (Bull Board)                                                   | super_admin, ops                        |
