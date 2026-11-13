# Prototype review

What is wrong or missing in the design prototype across all pages. Problems that belong to one feature are in that feature doc, under "Where the prototype is wrong or missing". Decisions made after this review (D20 email sign-in, D21 no couriers, D3 no voice calls) change some priorities below; the feature docs carry the current answer.

## Missing designs

Twelve designs are missing. Six are must-haves for a first release, because the product can't be used or sold without them. The rest depend on scope decisions the team hasn't made yet. Priorities below are my suggestion.

| #   | Missing design                     | Why it matters                             | Priority                          | Needs a decision first?       |
| --- | ---------------------------------- | ------------------------------------------ | --------------------------------- | ----------------------------- |
| 1   | Ask Dakly AI answers               | The headline feature has no answer screens | Must have                         | No                            |
| 2   | Campaign results page              | Owners can't see if a campaign worked      | Must have                         | No                            |
| 5   | WhatsApp onboarding and templates  | Main channel can't be set up without it    | Must have                         | No                            |
| 6   | Sign-up steps 2 to 4               | First 5 minutes of every trial             | Must have                         | No                            |
| 11  | Empty, error and plan-limit states | Every new user starts empty                | Must have                         | No                            |
| 12  | Phone layouts and Bangla UI        | Most owners use phones                     | Must have (phone); Bangla depends | Bangla UI scope               |
| 3   | Inbox and approvals queue          | Referenced by roles and notifications      | Should have                       | Build an inbox or not         |
| 4   | Orders page                        | Referenced by roles and profile            | Should have                       | Read-only or editable         |
| 10  | Follow-ups list and bulk actions   | Profile follow-ups go nowhere              | Should have                       | No                            |
| 9   | Courier integration                | Shipping and review workflows need it      | Should have                       | Which couriers                |
| 7   | Email channel                      | Mentioned but not sendable                 | Could have                        | Email in first release or not |
| 8   | AI voice calls                     | The tagline, with no flow                  | Could have                        | Voice in first release or not |

Per-feature missing designs: Ask Dakly AI answers ([10](../features/10-dashboard-and-notifications.md)), campaign results ([09](../features/09-campaigns-and-automations.md)), inbox and approvals ([04](../features/04-chats-and-ai-agent.md)), orders and couriers ([06](../features/06-orders-and-delivery.md)), WhatsApp onboarding ([02](../features/02-channel-connections.md)), sign-up and email ([01](../features/01-account-and-team.md)), follow-ups and bulk actions ([03](../features/03-customers-and-segments.md)).

## Missing states

Every screen in the prototype shows a busy, fully connected shop with 2,486 customers. Real users start empty and hit failures. These states need a design for each page they touch.

### New account (empty)

| Page                 | What the empty state should show                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| Dashboard            | Get started checklist with real progress; KPI cards as "—" with "appears after your first campaign"; no charts |
| All customers        | Three big options: connect store, import Excel, add one by hand or by voice                                    |
| Segments             | Ready-made segments with 0 and "fills in once customers are added"                                             |
| Campaigns            | One recommended first campaign, plus "Create campaign"                                                         |
| Automations          | The 3 recommended workflows, with what each needs connected                                                    |
| Social hub, My posts | Connect a Facebook Page; empty calendar with "Plan your first post"                                            |
| Analytics            | Explain what will appear and after how long (orders count for 7 days)                                          |
| Notifications        | "Nothing needs you right now"                                                                                  |
| Ask Dakly AI         | Suggestions that work without data ("Write my first welcome message")                                          |

### Errors and failures

| Situation                                | Where it shows                                       | What the design needs                                           |
| ---------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| Store sync failed or partly failed       | Integrations, Dashboard banner                       | Reason, last good sync, Retry, link to help                     |
| Facebook or WhatsApp access expired      | Banner on affected pages (Instagram already has one) | Warn 7 days before expiry, not only after                       |
| SMS credits run out mid-campaign         | Campaign results, notifications                      | How many were sent, how many wait, Buy credits and resume       |
| WhatsApp template rejected               | Campaign builder, template manager                   | Meta's reason, AI fix, resubmit                                 |
| WhatsApp quality drops or tier limit hit | WhatsApp settings, campaign results                  | Sending paused or spread over days, and why                     |
| Message failed for some customers        | Campaign results                                     | Grouped reasons, "Send by SMS instead"                          |
| Post failed to publish                   | My posts                                             | Reason, Retry, Edit                                             |
| Payment failed (bKash or card)           | Billing, banner for Owner                            | Grace period, retry, change method, what stops working and when |
| Import file has errors                   | Import step "Validate"                               | Row-level errors, download error rows, import valid rows only   |
| AI unavailable                           | Ask Dakly AI, caption tools                          | Short message and retry, the rest of the app still works        |
| No internet on phone                     | Every page                                           | Offline banner, unsent drafts kept                              |

### Plan-limit walls

| Limit (Growth plan)                          | What happens at the limit                                          |
| -------------------------------------------- | ------------------------------------------------------------------ |
| Customers (10,000)                           | Warn at 80% and 100%; new imports paused, nothing deleted; Upgrade |
| AI credits (2,000 a month)                   | Warn at 80%; AI buttons show "credits reset on Dec 1" or buy more  |
| Team members (5)                             | "Add team member" shows upgrade prompt                             |
| Automations (3 on Starter)                   | Starting a 4th asks to upgrade or turn one off                     |
| Feature not on plan (AI segments on Starter) | Locked state with which plan includes it                           |
| Downgrade                                    | What is kept, what is paused, before confirming                    |

## Phone layouts and Bangla UI

**Phone layouts.** The prototype works at phone width, but wide tables only scroll sideways inside their card, so key numbers look missing. Most owners will run Dakly from a phone, so these need their own phone designs:

- **Campaigns list**: a card per campaign with name, status, money earned and orders, not a 6-column table.
- **All customers**: a card per customer with name, phone, type and last purchase; filters in a bottom sheet; tap to call or WhatsApp.
- **Campaign builder and workflow editor**: step-by-step full-screen pages on phone; the workflow canvas can be a vertical list of steps.
- **Analytics tables** (Campaigns, Social posts): cards, with the top metric large.
- **Team members and Invoices**: cards.
- **My posts calendar**: Week or List as the default on phone, since Month is too small to read.

**Bangla UI.** The sign-in page says Bangla is "coming soon". The pitch is "AI that writes in Bangla", and owners outside Dhaka will expect the app itself in Bangla. If Bangla UI is in the first release, design:

- A language switch (sign-in, account menu, Settings) remembered per user.
- Key screens in Bangla to test text length (Bangla labels often run longer) and the Bangla font for numbers and ৳ amounts.
- Number format: Bangla digits (১২৩) or Latin digits, and the lakh grouping already used (৳3,42,800).
- Dates in Bangla, including the Bangla calendar if wanted for Pohela Boishakh campaigns.

## Problems across pages

Three problems run through every module: numbers that disagree between pages, features referenced but never designed, and a design that only shows a fully set-up shop.

### Numbers that disagree

Each of these needs one definition the whole product uses, ideally in a shared metrics glossary.

| Metric                             | Where                                                                         | Values shown                                            |
| ---------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| Money from marketing, last 30 days | Dashboard vs Analytics                                                        | ৳3,42,800 vs ৳5,15,124                                  |
| Orders from marketing              | Analytics headline vs funnel                                                  | 277 vs 264                                              |
| Total customers                    | Customers/Plan usage vs Shopify integration                                   | 2,486 vs 3,412                                          |
| Regular customers                  | Dashboard vs Segments                                                         | 1,124 vs 614                                            |
| One-time buyers                    | Dashboard vs Segments                                                         | 752 vs 702                                              |
| Social results                     | Analytics summary vs the posts listed                                         | 6,902 reached / 13 orders vs 15,185 reached / 29 orders |
| Winback reminder audience          | Dashboard "Coming up" vs its review screen                                    | 94 vs 106 customers                                     |
| Setup progress                     | Dashboard checklist vs Integrations                                           | "0 of 3 done" vs store and WhatsApp connected           |
| Team size                          | My profile vs Team page                                                       | "only person" vs 4 members                              |
| Instagram support                  | Connect account, Create post vs Social hub, calendar, Analytics, Starter plan | "Coming soon" vs connected and posting                  |
| Google login                       | Security summary vs Google row                                                | "connected" vs Connect button                           |

### Referenced but not designed

- **Inbox**: roles, the Support agent role and the notification "3 customers are waiting for a reply" all assume one. No page exists.
- **Orders**: a permission area and a profile tab, but no orders page.
- **Campaign results page**: campaign rows don't open.
- **Email channel**: in campaign history and Analytics, but not in the campaign builder, workflow steps or Integrations.
- **AI answers** in Ask Dakly AI (see Dashboard section).
- **AI voice call**: listed as a channel, does nothing.
- **Meta WhatsApp onboarding** and template approval status.
- **Courier tracking** for shipping messages.
- **Sign-up steps 2 to 4.**

### States the design doesn't show

Every screen shows a busy, fully connected shop. Before build, design at least: a brand-new account (no store, no customers, no campaigns); a failed or partial store sync; an expired WhatsApp or Facebook token; zero SMS credits mid-campaign; a WhatsApp template rejected by Meta; and the plan-limit wall (customers over 10,000, AI credits used up, team seats full).

### Phone layout

The app works at phone width (390 px) with a slide-in menu and no sideways page scroll. Wide tables (Campaigns, All customers) scroll sideways inside their card with no hint, so revenue and orders look missing. Use cards on phone for those lists. Most Bangladeshi shop owners will use Dakly on a phone, so this matters more than desktop polish.
