# Features

One file per feature. Each says what the feature does, the rules the service enforces, the screens, the data it owns and how to test it. Copy [\_template.md](_template.md) for a new one.

| #   | Feature                                                                        | Release | Status      |
| --- | ------------------------------------------------------------------------------ | ------- | ----------- |
| 01  | [Account, stores and team](01-account-and-team.md)                             | 1       | Building    |
| 02  | [Channel connections and webhook intake](02-channel-connections.md)            | 1       | Not started |
| 03  | [Customers, consent and segments](03-customers-and-segments.md)                | 1       | Not started |
| 04  | [Chats and the AI sales agent](04-chats-and-ai-agent.md)                       | 1       | Not started |
| 05  | [Products and stock](05-products-and-stock.md)                                 | 1       | Not started |
| 06  | [Orders and delivery](06-orders-and-delivery.md)                               | 1       | Not started |
| 07  | [Payments and billing](07-payments-and-billing.md)                             | 1       | Building    |
| 08  | [Content Studio and Social Auto Post](08-content-and-social.md)                | 1       | Not started |
| 09  | [Campaigns and automations](09-campaigns-and-automations.md)                   | 1       | Not started |
| 10  | [Dashboard, notifications and Ask Dakly AI](10-dashboard-and-notifications.md) | 1       | Not started |
| 11  | [Analytics](11-analytics.md)                                                   | 1       | Not started |
| 12  | [Admin panel](12-admin-panel.md)                                               | 1       | Building    |
| 13  | [Physical Shop](13-physical-shop.md)                                           | 2       | Not planned |

Status here is the feature's overall state. Task-level status lives in [tasks.md](../tasks.md); update both when a feature changes state.

## How a feature doc is laid out

1. Purpose and the decisions that changed the PRD since 12 November 2026.
2. Product requirements: the PRD module tab (screens, flows, rule IDs such as ORD-R5, states, permissions, events, acceptance criteria, what to add beyond the prototype).
3. Prototype screens: every dialog, tab and step behind the page's buttons.
4. Where the prototype is wrong or missing.
5. Engineering: services, state machines, tables, events and tests for the code.
6. Open questions.

The PRD text refers to its own tabs. Tab 1 is [01](01-account-and-team.md) and [02](02-channel-connections.md), tab 2 is [10](10-dashboard-and-notifications.md), tab 3 is [03](03-customers-and-segments.md), tab 4 is [04](04-chats-and-ai-agent.md), tab 5 is [05](05-products-and-stock.md) and [06](06-orders-and-delivery.md), tab 6 is [09](09-campaigns-and-automations.md), tab 7 is [08](08-content-and-social.md), tab 8 is [11](11-analytics.md), tab 9 is [13](13-physical-shop.md), tab 10 is [07](07-payments-and-billing.md), tab 11 is [12](12-admin-panel.md). "Glossary" is [glossary.md](../product/glossary.md).

Where the decisions list and the PRD text disagree, the decision wins. Where Engineering and Product requirements disagree on behaviour, raise it in the PR; do not pick one silently.

## Where the rules came from

Each feature doc was written from the PRD module tab, the release 1 engineering spec and the payments and admin tabs, then checked against the decisions log. Where the schema review (not yet accepted, Q10) changes a table or flow, the doc says "pending review".
