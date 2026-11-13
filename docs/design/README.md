# Design

The screenshots below come from the design prototype (https://claude.ai/artifact/Bi4AA8D5DFq1ifsUbgt1Su), captured on 13 Nov 2026 at 1440 × 900.

The prototype is a concept for layout and flow. Use it for where things sit on the page and how a person moves between screens. Do not use it for:

- Numbers, names, prices or counts. The sample shop's figures disagree between pages, and the WhatsApp cost (৳0.85) is about ten times too low.
- Behaviour. The feature doc says what a button does. Where the doc and the prototype differ, the doc wins.
- Scope. The prototype shows release 2 pages (Shop sales, Due book) and features not in release 1 (AI voice calls, email campaigns, courier booking). Check the feature doc's release.
- Exact styles. Build with the tokens in [theme.md](theme.md). The prototype uses about fifteen font sizes; the app uses the scale in the theme.

## Screens

| Screen                 | File                                                                 | Feature doc                                                                     |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Sign in                | [sign-in.webp](screenshots/sign-in.webp)                             | [01-account-and-team](../features/01-account-and-team.md)                       |
| Store settings         | [store-settings.webp](screenshots/store-settings.webp)               | [01-account-and-team](../features/01-account-and-team.md)                       |
| Team and permissions   | [team.webp](screenshots/team.webp)                                   | [01-account-and-team](../features/01-account-and-team.md)                       |
| Settings               | [settings.webp](screenshots/settings.webp)                           | [01-account-and-team](../features/01-account-and-team.md)                       |
| Extensions             | [extensions.webp](screenshots/extensions.webp)                       | [01-account-and-team](../features/01-account-and-team.md)                       |
| Integrations           | [integrations.webp](screenshots/integrations.webp)                   | [02-channel-connections](../features/02-channel-connections.md)                 |
| All customers          | [customers.webp](screenshots/customers.webp)                         | [03-customers-and-segments](../features/03-customers-and-segments.md)           |
| Segments               | [segments.webp](screenshots/segments.webp)                           | [03-customers-and-segments](../features/03-customers-and-segments.md)           |
| Chats                  | [chats.webp](screenshots/chats.webp)                                 | [04-chats-and-ai-agent](../features/04-chats-and-ai-agent.md)                   |
| Products               | [products.webp](screenshots/products.webp)                           | [05-products-and-stock](../features/05-products-and-stock.md)                   |
| Orders                 | [orders.webp](screenshots/orders.webp)                               | [06-orders-and-delivery](../features/06-orders-and-delivery.md)                 |
| Plan and usage         | [plan-and-usage.webp](screenshots/plan-and-usage.webp)               | [07-payments-and-billing](../features/07-payments-and-billing.md)               |
| Payments and invoices  | [payments-and-invoices.webp](screenshots/payments-and-invoices.webp) | [07-payments-and-billing](../features/07-payments-and-billing.md)               |
| Social hub             | [social-hub.webp](screenshots/social-hub.webp)                       | [08-content-and-social](../features/08-content-and-social.md)                   |
| My posts               | [my-posts.webp](screenshots/my-posts.webp)                           | [08-content-and-social](../features/08-content-and-social.md)                   |
| Campaigns              | [campaigns.webp](screenshots/campaigns.webp)                         | [09-campaigns-and-automations](../features/09-campaigns-and-automations.md)     |
| Automations            | [automations.webp](screenshots/automations.webp)                     | [09-campaigns-and-automations](../features/09-campaigns-and-automations.md)     |
| Dashboard              | [dashboard.webp](screenshots/dashboard.webp)                         | [10-dashboard-and-notifications](../features/10-dashboard-and-notifications.md) |
| Analytics              | [analytics.webp](screenshots/analytics.webp)                         | [11-analytics](../features/11-analytics.md)                                     |
| Shop sales (release 2) | [shop-sales.webp](screenshots/shop-sales.webp)                       | [13-physical-shop](../features/13-physical-shop.md)                             |
| Due book (release 2)   | [due-book.webp](screenshots/due-book.webp)                           | [13-physical-shop](../features/13-physical-shop.md)                             |

## Missing designs

Listed in [product/open-questions.md](../product/open-questions.md#designs-still-needed-before-the-screen-is-built). Build those screens from the feature doc and the components already in `packages/ui`; do not invent a new look.

## Updating screenshots

When the design changes, capture again at 1440 × 900, device scale 2, convert to WebP at about 75% quality, and keep each file under 200 KB. Replace files in place so links keep working.
