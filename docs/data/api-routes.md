# API routes

Every release 1 HTTP route, by feature, with the permission it needs. The rules are in [api-design.md](../rules/api-design.md) and [auth-and-permissions.md](../rules/auth-and-permissions.md). The request and response shapes are zod schemas in `packages/contracts/src/<feature>.ts`, written in each feature's contract step; an OpenAPI file can be generated from them when an outside client needs one.

Permission areas (No access / View / Edit, feature 01): `customers`, `chats`, `orders`, `products`, `campaigns`, `automations`, `socialPosts`, `analytics`, `storeSettings`, `billing`, `team`. A `GET` needs `<area>.view`, anything else `<area>.edit`, unless the table says otherwise. Lists take `cursor` and `limit` and return `{ items, nextCursor }`. Creates take an `Idempotency-Key` header where the table marks "idem".

## Without a store session

| Route                                                            | Notes                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| `POST /auth/code`                                                | Send a sign-in code by SMS or email; rate limited per target and IP |
| `POST /auth/code/verify`                                         | Sign in or sign up with the code                                    |
| `POST /auth/password`                                            | Sign in with phone or email and password                            |
| `POST /auth/google`                                              | Sign in with a Google ID token                                      |
| `POST /auth/password-reset`, `POST /auth/password-reset/confirm` | By code                                                             |
| `POST /auth/sign-out`                                            | Ends the session                                                    |
| `GET /me`, `PATCH /me`                                           | Profile, sign-in methods                                            |
| `GET /me/stores`, `POST /me/active-store`                        | Store switcher (`stores_for_user`)                                  |
| `POST /stores`                                                   | Create a store (sign-up step)                                       |
| `POST /invites/accept`                                           | Accept a team invite by token                                       |
| `POST /webhooks/meta`, `POST /webhooks/whatsapp`                 | Signature checked against `req.rawBody`                             |
| `POST /webhooks/payments/:gateway`                               | Gateway notifications                                               |
| `GET /payments/callback/:gateway`                                | Customer returns from the gateway                                   |
| `GET /public/stores/:storeSlug/order-link/:shortCode`            | Order and payment page for the customer                             |
| `POST /public/stores/:storeSlug/order-link/:shortCode/confirm`   | Customer confirms an order                                          |
| `GET /l/:code`                                                   | Tracked link redirect, or SMS opt-out page                          |

## Store and team (01)

| Route                                                                                                                                                          | Permission      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `GET /store`, `PATCH /store`                                                                                                                                   | `storeSettings` |
| `PATCH /store/extensions`                                                                                                                                      | Owner or Admin  |
| `GET /store/setup-checklist`                                                                                                                                   | any member      |
| `GET /members`, `POST /members/invites` (idem), `PATCH /members/:membershipId`, `DELETE /members/:membershipId`                                                | `team`          |
| `GET /roles`, `POST /roles`, `PATCH /roles/:roleId`, `DELETE /roles/:roleId`                                                                                   | `team`          |
| `GET /audit-log`                                                                                                                                               | Owner           |
| `GET /support-grants`, `POST /support-grants/:supportGrantId/approve`, `POST /support-grants/:supportGrantId/deny`, `POST /support-grants/:supportGrantId/end` | Owner           |

## Channels (02)

| Route                                                                                                          | Permission      |
| -------------------------------------------------------------------------------------------------------------- | --------------- |
| `GET /channel-connections`                                                                                     | `storeSettings` |
| `POST /channel-connections/meta`, `POST /channel-connections/whatsapp`                                         | `storeSettings` |
| `POST /channel-connections/:channelConnectionId/reconnect`, `DELETE /channel-connections/:channelConnectionId` | `storeSettings` |
| `PATCH /channel-connections/:channelConnectionId/ai`                                                           | `chats`         |
| `GET /sms-sender-ids`, `POST /sms-sender-ids`                                                                  | `storeSettings` |

## Customers and segments (03)

| Route                                                                                                                    | Permission                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `GET /contacts`, `GET /contacts/:contactId`                                                                              | `customers` (phones masked unless "See full phone numbers") |
| `POST /contacts` (idem), `PATCH /contacts/:contactId`, `DELETE /contacts/:contactId`                                     | `customers`                                                 |
| `GET /contacts/:contactId/timeline`                                                                                      | `customers`                                                 |
| `POST /contacts/:contactId/merge` (closes the suggestion)                                                                | `customers`                                                 |
| `GET /contact-match-suggestions`, `POST /contact-match-suggestions/:suggestionId/dismiss`                                | `customers`                                                 |
| `POST /contacts/:contactId/consents`                                                                                     | `customers`                                                 |
| `POST /imports`, `PATCH /imports/:importId`, `POST /imports/:importId/start`, `GET /imports/:importId`                   | `customers`                                                 |
| `POST /contacts/exports`                                                                                                 | `customers` + "Download customer lists"                     |
| `GET /segments`, `POST /segments`, `PATCH /segments/:segmentId`, `DELETE /segments/:segmentId`, `POST /segments/preview` | `customers`                                                 |
| `GET /tasks`, `POST /tasks`, `PATCH /tasks/:taskId`                                                                      | `customers`                                                 |

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

| Route                                                                                                                                                                                           | Permission    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `GET /campaigns`, `GET /campaigns/:campaignId`, `GET /campaigns/:campaignId/recipients`                                                                                                         | `campaigns`   |
| `POST /campaigns` (idem), `PATCH /campaigns/:campaignId`, `DELETE /campaigns/:campaignId` (draft only)                                                                                          | `campaigns`   |
| `POST /campaigns/:campaignId/audience-preview`, `POST /campaigns/:campaignId/cost-estimate`                                                                                                     | `campaigns`   |
| `POST /campaigns/:campaignId/schedule`, `POST /campaigns/:campaignId/send-now`, `POST /campaigns/:campaignId/pause`, `POST /campaigns/:campaignId/resume`, `POST /campaigns/:campaignId/cancel` | `campaigns`   |
| `GET /whatsapp-templates`, `POST /whatsapp-templates`, `POST /whatsapp-templates/:templateId/submit`                                                                                            | `campaigns`   |
| `GET /automations`, `GET /automations/:automationId`, `POST /automations`, `PATCH /automations/:automationId`                                                                                   | `automations` |
| `POST /automations/:automationId/publish`, `POST /automations/:automationId/pause`, `POST /automations/:automationId/archive`                                                                   | `automations` |
| `GET /automations/templates`, `POST /automations/templates/:templateKey/use`                                                                                                                    | `automations` |
| `GET /automations/:automationId/runs`                                                                                                                                                           | `automations` |

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

On the admin hostname, staff session, passkey or TOTP required. Each route names the staff roles that may call it.

| Route                                                                                                           | Staff roles                             |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `POST /admin/auth/sign-in`, `POST /admin/auth/verify`, `POST /admin/auth/sign-out`                              | all                                     |
| `GET /admin/stores` (`admin_store_overview`)                                                                    | all                                     |
| `GET /admin/stores/:storeId/*` (store data)                                                                     | support, with an approved support grant |
| `POST /admin/stores/:storeId/support-grants`                                                                    | support                                 |
| `POST /admin/stores/:storeId/suspend`, `POST /admin/stores/:storeId/restore`                                    | ops, with approval                      |
| `GET /admin/plans`, `PUT /admin/plans/:planCode`                                                                | finance, with approval to change        |
| `GET /admin/coupons`, `POST /admin/coupons`, `PATCH /admin/coupons/:couponId`                                   | finance                                 |
| `GET /admin/approvals`, `POST /admin/approvals/:approvalId/approve`, `POST /admin/approvals/:approvalId/reject` | super_admin, finance, ops               |
| `GET /admin/settings`, `PUT /admin/settings/:key`                                                               | super_admin, with approval              |
| `GET /admin/staff`, `POST /admin/staff`, `PATCH /admin/staff/:staffUserId`                                      | super_admin                             |
| `GET /admin/audit-log`                                                                                          | super_admin                             |
| `GET /admin/queues` (Bull Board)                                                                                | super_admin, ops                        |
