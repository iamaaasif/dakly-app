# Open questions

Questions waiting for Asif. Until one is answered, build the "working assumption" and keep it easy to change. When answered, move the answer to [decisions.md](decisions.md), delete the row here, and update the feature docs in the same PR.

| #   | Question                                                                                        | Working assumption                                                                           | Blocks                           |
| --- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------- |
| Q1  | Plan prices, Chats AI add-on prices, AI allowance per plan                                      | Prices live in a plan catalogue table, editable from the admin panel                         | Billing screens, not the build   |
| Q2  | Which WhatsApp BSP, and Dakly's margin, once a prepaid ৳ balance is added after release 1 (D44) | Release 1 uses Meta's Cloud API directly; build the WhatsApp driver against Cloud API shapes | WhatsApp balance after release 1 |
| Q3  | Extra stores: per plan, or Pro only?                                                            | One store per account on every plan; the data model already allows many                      | Store switcher, billing          |
| Q4  | Success targets for the first 3 months                                                          | None                                                                                         | Nothing in code                  |
| Q5  | First real POS partner (release 2)                                                              | CSV import only                                                                              | Release 2                        |
| Q7  | Is Inquiry an order stage, or a chat flag?                                                      | A chat flag (`buyingInterest`); every order starts at To confirm                             | Orders, Chats                    |
| Q9  | Apply for OpenAI zero data retention and name OpenAI in the privacy policy                      | Every call sends `store: false`                                                              | Launch                           |
| Q10 | Schema review: accept 56 tables (cut 6, merge 13, defer 3) and its 5 must-fix items?            | Built as proposed in DB-5 ([data/README.md](../data/README.md)); merging that PR accepts it  | Every feature with new tables    |
| Q11 | An organisation above stores in release 1?                                                      | No; a user has memberships in stores                                                         | Account                          |
| Q13 | Shopify and WooCommerce sync in release 1?                                                      | Not built until answered                                                                     | Customers, Orders                |
| Q15 | BullMQ Pro (groups) or a Valkey semaphore for per-store AI fairness?                            | Valkey semaphore, concurrency 3 per store                                                    | AI layer                         |
| Q16 | Return per ৳1 thresholds for the Great and Good labels on the Analytics Campaigns tab           | No label is shown until the thresholds are set                                               | Analytics Campaigns tab labels   |
| Q17 | How do Dakly links in social posts get tracked, and do posts get order credit?                  | Posts show reach and reactions only; link taps, chats started, orders and money show a dash  | Analytics Social posts tab       |

## Designs still needed before the screen is built

- Fix the 8 numbers that disagree between prototype pages, using the glossary.
- Order link page, WhatsApp embedded signup, the "not enough data" answer in Ask Dakly AI, the Analytics sales tab.
- Phone layouts and empty states for every new page.
- Email sign-in and email code screens (the prototype has only the Email tab).
- Remove the AI voice call card, the courier booking screens, the email campaign options and the Instagram DM campaign option from release 1 screens.
