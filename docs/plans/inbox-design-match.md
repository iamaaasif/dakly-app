# Inbox design match (CHAT-9 to CHAT-14)

The Figma Inbox frames, checked element by element against the Inbox that CHAT-5 built, and the backend each missing element needs, split into tasks of one PR each. Status lives in [tasks.md](../tasks.md). Delete a task's section once it is Done and [feature 04](../features/04-chats-and-ai-agent.md) describes it.

Read with: [CLAUDE.md](../../CLAUDE.md), [workflow.md](../development/workflow.md), [frontend rules](../rules/frontend.md), [frontend-styling.md](../rules/frontend-styling.md), [ai-and-llm.md](../rules/ai-and-llm.md), [feature 04](../features/04-chats-and-ai-agent.md).

## Design

Figma file "Dakly", page "Inbox", frames "Inbox" (folders open) and "Inbox / If Inbox Sidebar Collapse", 2,001 × 1,239 px, read on 26 November 2026. Keep the app's colours and tokens, lucide icons, the components in `packages/ui` and the 40 px tap targets; never copy Figma pixel values or its orange.

## 1. Already matched

These need no backend and are in the Inbox now: the icon rail and the fixed page, the 56 px top bar, the toolbar (Sort: Needs you first, All Channels, + Filter), the search box, row times (Just now, N min, today's time, Yesterday, Nov 9), the Needs you chip with the reason, the AI chip and the assignee mark, the channel mark on the avatar, the one-row chat header, the banner ("You're handling this chat · Exchange request · Goes back to Dakly AI in 1 hour", Back to AI), the composer placeholder, the Saved as a lead card with View in Customers, the formatted phone and the Cash on delivery total.

## 2. Element by element

| Design element                                                                      | Today                                                                    | Task    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------- |
| Folders: All conversations, Mine, Unassigned, Unreplied, AI handling, Order request | All, Needs you, AI handling, Follow up, Done, Not customers              | CHAT-9  |
| Folders: Snoozed, Resolved, Not customers, Tickets › Spam                           | Follow up and Done are the same statuses under other names; no Spam      | CHAT-9  |
| Row chips: Lead saved, Waiting for them                                             | Not in the list response                                                 | CHAT-10 |
| Row intent chips: No reply, Exchange, Asked price and the rest of the PRD list      | `conversations.intent_tag` exists and nothing writes it                  | CHAT-10 |
| Post rows in the list ("Post: New winter Kurti · 9 comments asking price")          | Comments have their own view behind the Comments channel                 | Q4      |
| System line "Dakly AI called your team · Exchange request"                          | No system messages are written                                           | CHAT-11 |
| Reply arrow under a customer message                                                | Copy only                                                                | CHAT-11 |
| Suggested reply card (reason, the AI's draft, Send, Edit)                           | Not built                                                                | CHAT-12 |
| Composer: emoji, attach, AI rewrite, Send product, Write with AI, Order link        | Saved replies only                                                       | CHAT-13 |
| Ask customer for missing details                                                    | Not built                                                                | CHAT-14 |
| Header more menu (three dots)                                                       | Not built                                                                | CHAT-14 |
| Shop switcher shows the plan ("Growth plan")                                        | Shows "Current shop"; the session has no plan name                       | CHAT-14 |
| District list with the delivery charge ("Dhaka · ৳60")                              | Division then District, kept on purpose (feature 04, area tree)          | Q2      |
| Only Create order                                                                   | Create order and Create and confirm                                      | Q3      |
| No summary pills under the folders                                                  | "1 need you", AI auto-reply state, orders from chats today               | Q1      |
| No AI agent button in the toolbar                                                   | AI agent button opens the agent drawer                                   | Q1      |
| Inputs 36 px, light borders                                                         | 40 px and the darker input border, for the tap-target and contrast rules | Kept    |

## 3. Tasks

### CHAT-9 Inbox folders

- Contract: folders `all`, `mine`, `unassigned`, `unreplied`, `ai_handling`, `order_request`, `snoozed`, `resolved`, `not_customers`, `spam`; counts for each in `ConversationCountsResponse`.
- Rules, all in the conversations repository query, no new columns: Mine is assigned to the signed-in member; Unassigned has no assignee and is not done; Unreplied has `last_inbound_at` after `last_outbound_at` (or no outbound) and is not done; Snoozed is `later`; Resolved is `done`; Spam is a not-customer contact whose reason is `spam`, and Not customers leaves Spam out; Order request is an open chat whose intent tag is `order` or `confirm` (empty until CHAT-10 writes the tag).
- Web: the folder list and the toolbar picker use the new set and icons; old `tab` links map to the new folders.
- Q1 decides whether Needs you stays a folder.

### CHAT-10 Row chips

- List response gains `contactKind` (joined from contacts) and `waitingForCustomer` (`last_outbound_at` after `last_inbound_at`).
- AI-4 writes `intent_tag` from the classification it already makes, mapped to the PRD tags; staff replies leave it. The row shows the tag, Lead saved for a lead, and Waiting for them.

### CHAT-11 System lines

- `messages` of kind `system` written in the same transaction as the event: the AI hands over (with the reason), an order is created from the chat, the contact is marked not a customer. The web already draws system messages as a centred line.
- Reply arrow: quote a customer message into the reply box (web only).

### CHAT-12 Suggested reply

- On hand-over the AI drafts one reply through `AiService` (no send), stored on the conversation with the reason and cleared on the next staff or AI message. Send posts it through the normal reply path; Edit puts it in the reply box. Bangla, Banglish and English eval cases in the same PR.

### CHAT-13 Composer tools

- Emoji picker (web only), attach a photo or file (outbound media through file storage and the channel driver), Send product (the product card AI-19 sends), Order link (the existing order link service), AI rewrite and Write with AI through `AiService`. Split into two PRs: send product and order link first, then the AI tools and attachments.

### CHAT-14 Missing details, more menu, plan name

- Ask customer for missing details: reads the empty fields of the order form and puts one Bangla message asking for them in the reply box.
- More menu: Mark as not a customer (the existing contact rule and dialog), Open customer profile, Block.
- Session gains the shop's plan name for the switcher subtitle.

## 4. Questions for Asif

- Q1: the design has no Needs you folder, no summary pills and no AI agent button. Recommended: keep Needs you as the first sort and the row chip, drop the pills, and open the AI agent from the Inbox title menu.
- Q2: one District list with the charge, or keep Division then District? Recommended: keep, because areas are a three-level tree and the charge depends on the zone.
- Q3: drop Create and confirm? Recommended: keep it, as the second button.
- Q4: should post comments appear as rows in the chat list? Recommended: yes, one row per post with open comments, opening the Comments view.
