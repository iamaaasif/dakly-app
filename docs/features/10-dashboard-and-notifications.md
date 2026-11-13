# Dashboard, notifications and Ask Dakly AI

|           |                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| Release   | 1                                                                                                          |
| Status    | Not started                                                                                                |
| Extension | Core                                                                                                       |
| Code      | `packages/core/src/{dashboard,notifications,ask}/`, `apps/web/src/features/{dashboard,notifications,ask}/` |
| Tasks     | HOME-1 to HOME-4                                                                                           |

## Purpose

The first screen after sign-in: what needs the owner today, what Dakly earned them, and a box to ask questions about their own shop in Bangla or English.

## Screens

![Dashboard](../design/screenshots/dashboard.webp)

Setup banner, greeting with the Ask box, a 3-step getting started card, KPI cards (money from marketing, customers who came back, new customers, orders), lifecycle groups, campaign suggestions, posts calendar and people to follow up. The prototype's numbers disagree with Analytics and Segments; every number here comes from the glossary. "How do you sell?" is asked at sign-up only.

## How it works

Dashboard: one API call returns the cards for the period. Numbers come from the same report functions Analytics uses, so they cannot disagree.

Notifications

1. A notification row has a dedupe key unique per store, so a rule that fires every hour creates one card until it is done.
2. Delivery: in the app (Server-Sent Events from the API, polling as fallback), web push for staff who allow it, and SMS, WhatsApp or email only for billing, credential and security alerts (email is allowed for these, D20).
3. One row per user who should see it (pending review).

Ask Dakly AI

1. Answers questions about the store's own data. It never writes SQL.
2. It calls read-only report tools (sales by period, top products, orders by stage, customers by segment, AI performance) that return glossary numbers.
3. Each answer shows the numbers it used. With too little data it says so (design needed).
4. Drafts (a post, a campaign) open in their editor and need approval like any other AI-written content (D7).
5. Counts against `ai_ask`.

## Rules

1. A number shown on the dashboard is computed by the same function as on Analytics.
2. Ask Dakly AI cannot change data.

## Permissions

Dashboard cards follow the area permissions behind each card. Ask Dakly AI only uses report tools the member's role can see.

## Events

Listens to most events to create notifications: `conversation.handed_over`, `payment.failed`, `channel.needs_reconnect`, `usage.threshold_reached`, `post.failed`, `subscription.past_due`.

## Data

`notifications`, `notification_reads` or one row per user (pending review), `push_subscriptions`.

## Acceptance

- Given money from marketing is ৳3,42,800 on Analytics for the last 30 days, then the dashboard shows the same.
- Given "who hasn't bought in 2 months?", then the answer lists the Stopped buying count and a link to the segment.
