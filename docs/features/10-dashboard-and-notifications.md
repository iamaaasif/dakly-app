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

## Decisions that change the PRD

The product requirements below are the PRD text from 12 November 2026. Where a later decision changed it, the decision wins:

- D17: Ask Dakly AI runs on OpenAI through `AiService`, not the Claude API.
- D20: the daily or weekly digest goes by WhatsApp in release 1; a digest by email can follow because transactional email is in release 1, but it is not built until Asif asks.
- Schema review (pending review): one notification row per user who should see it.

## Product requirements

### What it is for

Tell the owner, in under a minute, how the shop is doing and the one thing to do next. The Dashboard shows the state, Smart notifications list the opportunities and problems, and Ask Dakly AI answers questions in plain Bangla or English. Release 1.

### User stories

- As an owner, I want to see money earned from Dakly, returning and new customers and orders at a glance, so I know if things are improving.
- As an owner, I want Dakly to tell me which customers to contact today and how much that could earn, so I don't have to analyse anything.
- As an owner, I want to ask "who hasn't bought in 2 months?" and get a list I can message, so I act straight away.
- As an owner, I want to be told immediately when something breaks (messages failing, a page disconnected, customers waiting), so I don't lose sales.

### Screens

| Screen              | Elements                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard           | Date and greeting by time of day (Good morning before 12:00, Good afternoon 12:00–16:59, Good evening after); Ask box with 3 page-aware suggestions; setup checklist (tab 1); 4 KPI cards with sparkline, change and one-line explanation; "Who's buying from you" weekly bars (Came back vs New) with a generated insight; "Your customers at a glance" 6 lifecycle stages with stacked bar and a "Bring them back" call-out; "How your messages are doing" last 4 campaigns; "Coming up" next 4 scheduled items; shortcuts (Send a message, Add customers, Post on Facebook, Ask Dakly AI); "Latest from your customers" activity feed. |
| Period control      | 7 days / 30 days / 90 days (default 30) on Dashboard; applies to KPIs and the buyer chart.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Smart notifications | Bell with unread count in the top bar; page with To do and Done tabs; header "You could earn ৳X from N ideas below"; groups Fix now, Ways to sell more, Good news; each card: title, reason, avatars and count of people, estimated ৳, primary button, Done, Undo. Detail view: why, data used, suggested action, two buttons. Preferences: categories on/off and frequency.                                                                                                                                                                                                                                                              |
| Ask Dakly AI panel  | Opens from the top bar or any Ask box, slides in from the right (full screen on phone). Shows 3 suggestions for the current page, chat history, input with send, "Dakly AI uses only your shop's data. It never sends or publishes anything without your approval."                                                                                                                                                                                                                                                                                                                                                                       |
| Ask Dakly AI page   | Left: New conversation, recent conversations by date. Main: 7 starter prompts (Customers, Campaigns, Segments, Content, Offers, Results, Growth), then the conversation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### How it works

**Dashboard data**

All numbers come from the Glossary definitions. "Money from Dakly messages" = Money from marketing. "Your customers at a glance" = lifecycle stages, which always sum to Total customers; each row opens All customers filtered to that stage. Campaign rows open the campaign results page. "Coming up" lists scheduled campaigns, scheduled posts, automations running today ("Automatic · N sent today") and items waiting for approval ("Needs your OK" with Review). The activity feed shows the latest 5 events of these kinds: new customer, purchase, became a Best customer, read a message, came back after N days; each links to the customer.

**Insight sentence on the buyer chart**

Written by rules, not free AI text: busiest week in the period and its buyer count; share of buyers who had bought before; if that share is 50% or more add "so messaging past customers works well for you", otherwise "so finding new buyers matters most right now".

**Smart notifications engine**

A nightly job (06:00 local) plus real-time triggers create notification cards. Each card type has a rule, an audience, an estimate and an action:

| Card                             | Trigger rule                                                                      | Estimated ৳                                            | Action                                          |
| -------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| Messages didn't send             | Any WhatsApp failures in a campaign in the last 24 h                              | None                                                   | Send by SMS to those with SMS consent           |
| Account disconnected             | Meta token expired or expiring within 7 days                                      | None                                                   | Reconnect                                       |
| Customers waiting for a reply    | Chats in Needs you for over 30 minutes during business hours                      | None                                                   | Reply now (opens Chats › Needs you)             |
| Showed interest but didn't order | Chats where price was shared, no order, no reply for 24 h                         | Count × average order value × 20%                      | Follow up (opens a pre-written follow-up)       |
| Stopped buying                   | Stopped buying stage grew by 10+ people in 14 days                                | Count × AOV × store's win-back conversion (default 8%) | Win them back (campaign builder, goal win-back) |
| VIPs overdue                     | VIP segment members past 1.5 × their usual gap                                    | Count × their AOV × 40%                                | Send VIP offer                                  |
| New customers not welcomed       | New customers with no message in their first 7 days, and no welcome automation on | Count × AOV × store's second-order rate                | Say welcome                                     |
| No posts planned                 | No scheduled post in the next 7 days and Social Auto Post is on                   | None                                                   | Plan posts                                      |
| Campaign doing well              | Tap rate 50%+ above the store's median                                            | None                                                   | Send it again to a similar group                |
| Metric milestone                 | Repeat purchase rate up 1+ point vs previous 30 days                              | None                                                   | See report                                      |

Conversion defaults are replaced by the store's own rates once it has 3 or more campaigns of that kind. Cards expire after 7 days or when their condition is no longer true. A card the owner marks Done moves to Done; Undo brings it back.

**Ask Dakly AI**

The assistant is a language model with read-only tools over the current store's data. It never writes data directly; every action is a button that opens the right screen pre-filled for the owner to review.

| Tool the AI can call                  | Returns                                                  |
| ------------------------------------- | -------------------------------------------------------- |
| query\_customers(filters)             | Count and sample of customers matching filters           |
| get\_segment(name) / list\_segments() | Segment rules, counts, spend                             |
| get\_campaign\_results(id or period)  | Sent, delivered, read, tapped, orders, revenue, failures |
| get\_metrics(names, period)           | Any Glossary metric                                      |
| get\_products(filters)                | Products, prices, stock, sales, times asked              |
| get\_customer(id)                     | Profile facts for the customer page                      |
| get\_brand\_profile()                 | Voice and language settings for writing                  |

| Answer type              | When                                                                                | Shows                                                                           | Buttons                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Audience suggestion      | "Who should I target?", "inactive", "haven't bought"                                | Suggested audience and count, why, recommended action, data used, draft message | Generate campaign; View customers                                         |
| Segment from description | Owner describes a group in words                                                    | Rules in plain words, estimated count, data used                                | Review and save segment; View customers                                   |
| Top segments             | "Highest value"                                                                     | Ranked segments with count, spend, average, one-line meaning                    | Create campaign; Open segments                                            |
| Content draft            | "Write a post / message"                                                            | Headline, text, hashtags in the brand voice                                     | Copy; Make an English (or Bangla) version; Use in campaign; Schedule post |
| Offer ideas              | "Offer for VIPs"                                                                    | 3 offer types with reasons; never invents discount values or codes              | Create campaign                                                           |
| Performance explained    | "Explain my campaign"                                                               | Facts, Dakly's interpretation, attribution note                                 | Retry failed by SMS; Create follow-up                                     |
| Advice                   | "How do I get more repeat orders?"                                                  | 3 numbered actions with the store's numbers                                     | One button per action                                                     |
| Customer next step       | Asked on a customer profile                                                         | Facts and one suggestion                                                        | Send personal offer                                                       |
| Not enough data          | The answer needs data the store doesn't have yet (for example fewer than 30 orders) | What is missing and how to get it                                               | Relevant setup action                                                     |
| Can't do that            | Request outside Dakly (for example "refund this card")                              | One sentence on what Dakly can do instead                                       | Up to 2 suggestions                                                       |

### Business rules

| ID       | Rule                                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HOME-R1  | Dashboard numbers equal the Analytics numbers for the same period and window (Glossary).                                                                                   |
| HOME-R2  | Clickable-looking rows always open something: stage rows open a filtered list, campaign rows open results, feed items open the customer.                                   |
| AI-R1    | The assistant only uses the current store's data. It must quote the numbers it used and say "sample estimate" when a count is estimated.                                   |
| AI-R2    | It answers in the language of the question (Bangla script, Banglish or English).                                                                                           |
| AI-R3    | It never invents prices, discounts, coupon codes, delivery charges or policies. If asked, it asks the owner to set them.                                                   |
| AI-R4    | It never sends, publishes, deletes or spends money. Buttons only open screens.                                                                                             |
| AI-R5    | Each answer costs AI usage: 1 unit per answer, 3 per content draft with options. Shown under the input as "N AI credits left". At 0, the panel explains and offers top-up. |
| AI-R6    | Conversations are kept for 90 days per user and are private to that user.                                                                                                  |
| NOTIF-R1 | A person can appear in at most one "Ways to sell more" card at a time (highest estimated value wins), so estimates are not double-counted in "You could earn".             |
| NOTIF-R2 | Fix now cards are also sent as a push or SMS to the Owner if not opened within 2 hours (configurable in preferences).                                                      |

### States and edge cases

- New store with no orders: KPIs show ৳0 and "No orders yet"; the buyer chart is replaced by "Your chart appears after your first 5 orders"; at-a-glance shows the import options.
- Less than one full period of history: change badges show "New" instead of a percentage.
- Assistant offline or provider error: "Dakly AI is busy. Try again in a minute." and keep the typed question.
- Owner asks about another store: "I can only see Urban Trend. Switch store to ask about Urban Trend Kids."

### Permissions

Dashboard is visible to every role, but each card hides if the role has no access to its area (for example a Support agent doesn't see campaign results). Ask Dakly AI only uses data the asking user is allowed to view, and masks phones if their role masks phones.

### Events

notification.created, notification.done, assistant.asked, assistant.action\_clicked (for learning which answers are useful).

### Acceptance criteria

- Given 2,486 customers, when the Dashboard loads, then the 6 stage counts add up to 2,486.
- Given the attribution window is 3 days, when the owner opens Dashboard and Analytics for the last 30 days, then "Money from Dakly messages" equals "Your marketing earned".
- Given the owner asks "কারা ২ মাস কিনেনি?", then the answer is in Bangla and includes a customer count and a View customers button.
- Given 128 customers in Stopped buying of whom 109 have WhatsApp consent, when the owner taps Win them back, then the campaign builder opens with goal Win back, audience Stopped buying and "109 can receive on WhatsApp".

### Beyond the prototype

The prototype's dashboard numbers, notifications and AI answers are hand-written examples. In the product every number comes from the metrics service (Glossary) and every notification from a rule.

| Addition                                                                                                                                                                                                     | Why                                                                   | Release |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------- |
| Ask Dakly AI answers only from Dakly's own data through fixed query tools, and shows its source under each answer ("From Orders, last 30 days"). If data is missing it says so and suggests what to connect. | Prevents made-up numbers; the prototype's answers were scripted       | 1       |
| Each AI answer that suggests an action has a button that opens the prepared action (draft campaign, segment, reorder list) for approval                                                                      | Turns advice into results, as Klaviyo and Nabik do                    | 1       |
| Daily or weekly digest to the owner on WhatsApp (email in a later release): yesterday's orders, money from marketing, chats waiting, dues, one suggestion                                                    | Owners live in WhatsApp, not dashboards (Nabik sends digests)         | 1       |
| Shop goals: owner sets a monthly sales or repeat-customer goal; Dashboard shows progress and the AI plans towards it                                                                                         | Nabik's "Shop Lead" works toward goals; gives the dashboard a purpose | 2       |
| Smart notifications are rules with thresholds, dedupe keys, snooze, and a "Why am I seeing this?" line; each rule can be turned off                                                                          | The prototype listed fixed examples; real rules must not spam         | 1       |
| Mobile-first dashboard layout and push notifications (installable web app)                                                                                                                                   | Most owners run the shop from a phone                                 | 1       |

**Do not copy from the prototype:** the specific KPI values, the sample notifications text and counts, and the scripted Ask Dakly AI conversations.

## Prototype screens

Captured from the prototype on 13 Nov 2026 by opening each button, tab and dialog. Layout only: the numbers, names and some flows are sample data (see the next section).

**Ask Dakly AI panel**

![Ask Dakly AI panel](../design/screenshots/dashboard-and-notifications/ask-dakly-ai.webp)

**Ask: who hasn't bought in 2 months (prototype answer)**

![Ask: who hasn't bought in 2 months (prototype answer)](../design/screenshots/dashboard-and-notifications/who-hasn-t-bought-in-2-months.webp)

**Ask: write a Facebook post (prototype answer)**

![Ask: write a Facebook post (prototype answer)](../design/screenshots/dashboard-and-notifications/write-a-facebook-post-for-winter.webp)

**Ask: which product sells best (prototype answer)**

![Ask: which product sells best (prototype answer)](../design/screenshots/dashboard-and-notifications/which-product-sells-best.webp)

**KPI card opened**

![KPI card opened](../design/screenshots/dashboard-and-notifications/money-from-dakly-messages-3-42-800-up-18.webp)

**Stage row opened**

![Stage row opened](../design/screenshots/dashboard-and-notifications/stopped-buying-no-order-in-60-days-128.webp)

**Approve a campaign from Coming up**

![Approve a campaign from Coming up](../design/screenshots/dashboard-and-notifications/review-step-2.webp)

**Open calendar**

![Open calendar](../design/screenshots/dashboard-and-notifications/open-calendar.webp)

**Activity feed item opened**

![Activity feed item opened](../design/screenshots/dashboard-and-notifications/rakib-uddin.webp)

## Where the prototype is wrong or missing

The prototype is a concept with sample data. Build from this doc, not from the prototype, where they differ.

### Design review: Dashboard and Ask Dakly AI

The dashboard is well aimed at a shop owner: money first, then who is buying, who is slipping away, and one-click actions. Ask Dakly AI is the headline feature, but the design only shows its welcome screen. No answer was ever designed, so the team has nothing to build the most important screen from.

| Feature                     | What the design shows                                                                                                                               | Gaps and questions for build                                                                                                                                                                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Greeting and AI ask box     | Date, "Good morning, Jakir", ask box "in Bangla or English", 3 suggested questions                                                                  | Date and greeting are fixed text.                                                                                                                                                                                                                                                                              |
| Get started checklist       | 3 steps: connect store, set up WhatsApp and SMS, send first campaign; "0 of 3 done"                                                                 | Shows 0 of 3 even though the store and WhatsApp are connected and campaigns were sent. Needs real completion rules and should hide when done.                                                                                                                                                                  |
| KPI cards                   | Money from Dakly messages ৳3,42,800, customers who came back 412, new customers 186, orders 904, each with change vs previous 30 days and sparkline | Money figure contradicts Analytics (৳5,15,124 for the same period). No date-range control.                                                                                                                                                                                                                     |
| Who's buying chart          | Weekly bars, came back vs new, with a plain-language insight (busiest week, 69% repeat)                                                             | Maths checks out. Insight text needs rules or the AI to generate it.                                                                                                                                                                                                                                           |
| Customers at a glance       | 6 groups adding to 2,486, a stacked bar, "224 slipping away or stopped" call-out with "Bring them back"                                             | "Bought once" is 752 here but One-time buyers is 702 on Segments. "Regulars" is 1,124 here but Regular customers is 614 on Segments. Rows look clickable but aren't.                                                                                                                                           |
| How your messages are doing | 4 recent campaigns with status label (Working well, Doing okay), tap rate bar, revenue and orders                                                   | Define the thresholds behind "Working well". Rows should open the campaign.                                                                                                                                                                                                                                    |
| Coming up                   | Scheduled campaign, Facebook post, a winback that "Needs your OK" with Review, daily automation                                                     | Approval queue is a good idea. It needs its own place (e.g. a To-do in notifications).                                                                                                                                                                                                                         |
| Shortcuts                   | Send a message, Add customers, Post on Facebook, Ask Dakly AI                                                                                       | Fine.                                                                                                                                                                                                                                                                                                          |
| Latest from your customers  | Activity feed (new customer, purchase, became best customer, read message, came back)                                                               | Good. Each item should link to the customer profile.                                                                                                                                                                                                                                                           |
| Ask Dakly AI side panel     | Knows the current page, 3 page-specific suggestions, "Dakly AI suggests. You approve before anything is sent." Full view keeps a chat history       | Every question, typed or suggested, returns the same capability menu. Design the answer types: a customer list with "Create segment", a drafted message with "Use in campaign", a chart, a "not enough data" reply, and Bangla replies. Define which actions the AI may prepare and which credit cost applies. |

### Missing design: Ask Dakly AI answer screens

**Why it's needed.** The AI assistant is the product's name and pitch. In the prototype, every question returns the same welcome menu ("Here's what I can help with right now"). Engineers have no design for what an answer looks like, which is the most-used screen in an AI product.

**What to design.** One answer layout per kind of question, in both the side panel and Full view:

- **Customer list answer** ("Who hasn't bought in 2 months?"): a one-line summary ("128 customers, ৳6,10,400 spent before"), the first 5 to 10 names with last order and spend, and actions: Save as segment, Create campaign, Export.
- **Draft answer** ("Write a Facebook post for winter"): 2 or 3 caption options in the chosen language, with Use in post, Regenerate, Make shorter, Translate. For messages: Use in campaign.
- **Number or chart answer** ("Which product sells best?"): a short answer with the number first, a small bar chart or ranked list, the date range used, and "See in Analytics".
- **Recommendation answer** ("What should I do to increase repeat purchases?"): 2 or 3 numbered actions, each with expected ৳ impact and a button that opens the prepared campaign, segment or workflow.
- **Bangla and Banglish**: the same layouts with Bangla text, so the team can check line length and fonts.

**States.** Thinking (with what it's reading: "Reading 2,486 customers"); not enough data ("Connect your store first"); question outside scope; AI credits used up; error and retry; feedback (thumbs up or down); "what data did this use" disclosure.

**Rules to decide.** Which actions the AI may prepare but never send (the design promises "You approve before anything is sent"); how many credits each answer type costs; whether chat history is per user or shared with the team.

## Engineering

### Screens in release 1

![Dashboard](../design/screenshots/dashboard.webp)

Setup banner, greeting with the Ask box, a 3-step getting started card, KPI cards (money from marketing, customers who came back, new customers, orders), lifecycle groups, campaign suggestions, posts calendar and people to follow up. The prototype's numbers disagree with Analytics and Segments; every number here comes from the glossary. "How do you sell?" is asked at sign-up only.

### How it works

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

### Rules

1. A number shown on the dashboard is computed by the same function as on Analytics.
2. Ask Dakly AI cannot change data.

### Permissions

Dashboard cards follow the area permissions behind each card. Ask Dakly AI only uses report tools the member's role can see.

### Events

Listens to most events to create notifications: `conversation.handed_over`, `payment.failed`, `channel.needs_reconnect`, `usage.threshold_reached`, `post.failed`, `subscription.past_due`.

### Data

`notifications`, `notification_reads` or one row per user (pending review), `push_subscriptions`.

### Acceptance

- Given money from marketing is ৳3,42,800 on Analytics for the last 30 days, then the dashboard shows the same.
- Given "who hasn't bought in 2 months?", then the answer lists the Stopped buying count and a link to the segment.

## Open questions

None.
