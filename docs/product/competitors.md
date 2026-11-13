# Competitors and sources

What similar products do, checked on 12 November 2026. Feature docs say which of these Dakly copies. Use this page when a feature question comes up ("how does Nabik do it?"), not as a list of things to build.

What similar products do, what Dakly copies, and where Dakly is different. Research done 12 Nov 2026 from public pages; prices and features change, so re-check before using them in sales material.

## Summary: where Dakly wins and where it must catch up

| Area                                                               | Market today                                                                                | Dakly position                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Order and courier operations                                       | SeloraX and Pathao Commerce are strong: storefront, courier booking, fraud check, POS       | Match the basics (tab 5); don't compete on storefront.                                   |
| Customer marketing (segments, campaigns, automations, attribution) | Weak locally; global tools (ManyChat, respond.io, Klaviyo) are not built for BD COD and SMS | Dakly's main reason to exist.                                                            |
| AI chat selling in Bangla                                          | Several small local tools; quality varies                                                   | Release 1 core, with clear limits and handover (tab 4).                                  |
| Baki and counter                                                   | TallyKhata and similar apps are free and loved                                              | Connect baki and counter buyers to marketing (tab 9), don't charge for the ledger alone. |
| Return risk                                                        | Courier fraud-check plugins scrape courier portals                                          | Use the shop's own parcels only (decision), add courier APIs where officially offered.   |

## SeloraX (Bangladesh)

- **What it is:** an all-in-one e-commerce platform for BD sellers: storefront, order management, inventory, POS, courier integrations (Steadfast, Pathao, RedX, Carrybee) and a fraud check that looks at a customer's history across its merchant network.
- **Notable features:** an AI Bangla phone call that confirms COD orders before dispatch; bulk courier booking; stock and branch management.
- **Price seen:** about ৳4,999 per month for its main plan.
- **What Dakly takes:** order stages and bulk courier booking (tab 5); COD confirmation as an automation ("Confirm order on WhatsApp") instead of voice calls in release 1.
- **How Dakly differs:** Dakly does not build a storefront; it works with Facebook-first sellers and plugs into Shopify and WooCommerce. Dakly's depth is in customers, segments, campaigns and attribution.
- Source: [selorax.io](https://www.selorax.io/), [features](https://selorax.io/features)

## Pathao Commerce (Bangladesh)

- **What it is:** launched September 2026 by Pathao. A unified inbox for Facebook and Instagram, AI address entry, checkout links, Pathao Pay, and courier booking with Pathao Courier, with a buyer trust rating from Pathao's delivery data.
- **Why it matters:** Pathao has delivery data on millions of buyers, so its trust rating will be better than anything a single shop has. It will likely be cheap or free to pull merchants into Pathao Courier.
- **What Dakly takes:** order link with address autocomplete (tab 5), AI address parsing in chats (tab 4).
- **How Dakly differs:** courier-neutral (4 couriers), marketing and retention focus, WhatsApp and SMS campaigns, shop counter and baki.
- **Risk:** if Pathao adds campaigns, Dakly loses its simplest pitch. Mitigation: ship attribution ("৳X back for every ৳1") early, because it proves value in money.
- Source: [Future Startup, 15 Sep 2026](https://futurestartup.com/2026/09/15/pathao-launches-pathao-commerce-strategic-coherence-and-pathaos-motivation/)

## Nabik AI (Bangladesh): closest direct competitor

- **What it is:** web software by Auto Probaho Technology for Facebook, Instagram and WhatsApp shops, service businesses and content Pages. One inbox for Pages, Messenger, Instagram, WhatsApp, comments and SMS; Shopify, WooCommerce, WordPress, Daraz, Google Sheets and Meta catalog integrations.
- **AI:** agents answer in Bangla, Banglish or English from the shop's products, stock and policies; act on their own when messages, comments or orders arrive; risky actions wait in a "Needs You" list. Teams of agents (chats, posts, delivery, money, repeat customers) under a "Shop Lead" with a "Guardian" team for safety and budget. Owners train it by chatting, with photos, documents and voice notes, and confirm before anything is saved.
- **Operations:** chats and comments become orders on the same screen; courier booking with Pathao, Steadfast, RedX, eCourier; COD tracking to courier payout; payment links (SSLCommerz, bKash, Nagad); live stock with variants, SKUs, barcodes and a movement ledger; profit per order; VAT tools (Mushak-6.3, VAT 9.1 return).
- **Marketing:** Social Studio (AI images, captions, weekly plan, idea board, news research, Meta results). Offers, sequences and WhatsApp marketing are "Coming soon" on the Business plan.
- **Price seen:** Pro ৳999 a month with 600 AI credits, 3 Pages or numbers, 5 team members; Business from ৳5,999 (coming soon); extra credits ৳0.50 each; free Pro month.
- **Security claims:** per-shop isolation, encryption, audit log, no training on shop data, export and delete anytime.
- **What Dakly takes:** train-by-chat with confirmation, "Needs you" approvals, profit per order, COD reconciliation, payment links, stock ledger, owner digests, security promises (now in the Architecture tab).
- **How Dakly differs:** Nabik is ops-first and its marketing automation isn't live yet. Dakly's lead is customer marketing: segments, WhatsApp and SMS campaigns, Omnisend-style automations, consent and attribution in ৳. Dakly must ship those well in release 1 before Nabik's Business plan lands.
- Source: [nabik.ai](https://nabik.ai)

## Omnisend and Klaviyo (automation reference)

- **What they do:** e-commerce email and SMS marketing with visual workflows: real-time and custom-event triggers, trigger and flow filters, delays, conditional and channel splits, A/B splits, product recommender blocks, exit conditions, frequency capping, per-step reports and revenue per automation. Pre-built welcome, cart and product abandonment, order and shipping confirmation, cross-sell and winback flows. Klaviyo adds predicted lifetime value, churn risk and next order date.
- **What Dakly takes:** the full workflow model in tab 6 ("Automation engine"), smart sending and frequency caps, holdout-based lift and predictive fields (release 2).
- **How Dakly differs:** WhatsApp, SMS and Messenger first instead of email; COD confirmation, courier and baki triggers; Bangla AI writing.
- Sources: [Omnisend automation](https://www.omnisend.com/features/automation/), [Klaviyo](https://www.klaviyo.com/)

## AiPraktor (Bangladesh): AI chat agent, pay as you go

- **What it is:** an AI agent for shops and service businesses selling on Messenger, Instagram DMs, WhatsApp and Facebook comments. Bangla-first site with an English toggle.
- **AI:** understands text, Banglish, product photos (asks to confirm when unsure) and voice notes; shows product cards with buttons; answers size, measurement and stock from the catalogue; confirms orders and sends receipts; courier updates for Steadfast and Pathao with tracking buttons, then asks for a review. Service bookings with bKash advance payment (transaction id) and reminders. Knowledge base from the business's documents.
- **CRM:** per-customer timeline with AI summaries, 6-stage lead pipeline, hot, warm and cold follow-ups sent inside Meta's 24-hour window, broadcasts to people who messaged in the last 23 hours.
- **Hand-over:** AI flags when a person is needed and logs why; staff get a push notification and claim the chat in one tap; a timer gives the chat back to the AI automatically.
- **Other:** Chrome extension for Meta Business Suite, installable phone app, roles by business or by Page, dashboard of AI vs human handling, complaints and payments.
- **WhatsApp:** connects the shop's own number by QR code as a linked device, not Meta's official Business API; the site admits some risk to the number.
- **Price:** no monthly fee. Prepaid credits (bKash, Nagad, bank) that never expire, free starting credit, email warning before credit runs out. They estimate ৳1–2 per customer handled end to end.
- **Security claims:** no trackers, keys encrypted and never shown in the browser, nightly encrypted backups on a separate server, data deletion on request.
- **What Dakly takes:** claim-a-chat with automatic return to the AI after a timer; AI chat summaries on the profile; hot, warm and cold lead scoring for follow-ups; review request after delivery; a simple per-customer cost story for pricing.
- **How Dakly differs:** official WhatsApp Business API only (no QR linked-device sessions, which risk bans and break Meta terms); store, POS and baki data in the same customer list; campaigns, automations and attribution beyond the 24-hour window.
- **Pricing lesson:** a pure pay-as-you-go option is attractive to tiny shops. Consider a Free plan with prepaid AI conversations as the entry point, alongside the Chats AI add-on (still open in Pricing).
- Source: [aipraktor.com](https://www.aipraktor.com/)

**AiPraktor, more detail from its help centre:** 10-minute setup with a practice mode and 3 test questions before going live; catalogue from WooCommerce, CSV or Excel, or by pasting a product page or Facebook post link; knowledge as text, Q&A or .txt, .md and .csv files (no PDF or Word); thumbs-down on a reply lets staff type or speak the right answer, which re-runs the chat. Saved replies can answer automatically at no AI cost. Couriers: Pathao confirmed live, Steadfast, RedX and eCourier newer. No Shopify or Daraz connection. Instagram only together with a Facebook Page. WhatsApp through WaSenderAPI as a linked device: the phone must come online every 14 days, the number may be banned, and there are no broadcasts, follow-ups or buttons. App and database hosted in Malaysia, encrypted backups in Ireland, AI models through OpenRouter, no uptime guarantee. No seat limit; up to 5 businesses per login share one credit balance.

## Intercom Fin and Gorgias AI Agent (AI support reference)

- **Fin:** answers from help articles, PDFs and web pages with retrieval; "guidance" for tone and policy; procedures for multi-step tasks; reads images; 45+ languages. Testing by simulations, batch tests and answer rating; answer inspection shows the sources used. Always hands off jailbreak attempts and high-risk topics. Reports resolution rate, involvement rate and a CX score; topic explorer groups conversations. $0.99 per outcome, once per conversation.
- **Gorgias AI Agent:** takes actions in Shopify (cancel order, edit shipping address) only when conditions pass, such as "not yet fulfilled", and confirms the change with the shopper first. An interaction counts as automated if no human is needed within 72 hours.
- **What Dakly takes:** test suites, answer inspection, guarded actions with confirmation, resolution metrics (tab 4).
- Sources: [Fin explained](https://www.intercom.com/help/en/articles/7120684-fin-ai-agent-explained), [Fin outcomes](https://fin.ai/help/en/articles/13975800-fin-pricing-outcomes), [Gorgias actions](https://docs.gorgias.com/en-US/create-an-action-for-ai-agent-567325)

## respond.io and ManyChat (inbox and chat automation reference)

- **respond.io:** workflows with triggers (conversation opened, click-to-chat ad, broadcast response, conversation closed), steps (assign, branch with Else, ask a question with a 7-day timeout, update field, Google Sheets row, AI agent). Assignment by round robin, round robin among online staff, or fewest open contacts; unassign on close. A contact can't re-enter a workflow they are in; an outgoing message, incoming message or manual assignment can stop a workflow. 150 workflows per workspace.
- **ManyChat:** comment trigger can like the comment, reply publicly and send a DM; Meta allows one private reply per comment, within 7 days; ManyChat advises specific keywords and varied public replies to avoid account flags.
- **What Dakly takes:** assignment strategies, workflow stop rules, comment handling limits (tabs 4 and 6).
- Sources: [respond.io workflows](https://respond.io/help/workflows/workflows-overview), [respond.io assignment](https://respond.io/help/convert-leads/assignment-strategy-automatic-contact-distribution-load-balancing), [ManyChat comment tool](https://manychat.com/blog/comment-growth-tool/)

## Wati and Interakt (WhatsApp commerce reference)

- **Wati:** WhatsApp catalog; Auto checkout (India, beta) sends an address request and a payment message when a customer sends a cart; Shopify cart reminders with product images and checkout links; click-to-WhatsApp ad leads.
- **Interakt:** catalog from Facebook, Shopify or Google Sheets searchable in the inbox; cart reminders with checkout links.
- **What Dakly takes:** WhatsApp catalog and cart-to-order in release 2 (tab 5).
- Sources: [Wati auto checkout](https://support.wati.io/en/articles/11463061-how-to-enable-auto-checkout-and-collect-payment-for-my-catalog-orders), [Interakt on Shopify](https://apps.shopify.com/interakt-marketing)

## Where Dakly must be better than all of them

1. **Official channels only.** WhatsApp through Meta's Business API, never linked-device sessions.
2. **Retention, not just replies.** No local competitor ships consented WhatsApp and SMS campaigns, Omnisend-grade automations and ৳ attribution today; Nabik lists them as coming soon.
3. **One customer across chat, store, counter and baki.**
4. **Published reliability and security:** 99.9% uptime target, data in a named region, export of everything including chats, and a public security page. AiPraktor offers no uptime guarantee and can't export chats.
5. **Measured AI:** resolution rate, "Why this answer" and test suites, so owners can trust auto-replies.

## TallyKhata, Khatabook, OkCredit (digital baki ledgers)

- **What they do:** free apps that replace the paper khata. Each credit entry sends the customer an SMS with the amount and new balance; reminders by SMS; works offline; simple cash book.
- **Why it works:** it copies the shopkeeper's existing habit exactly, and the SMS on each entry builds trust between shop and customer.
- **What Dakly takes:** the per-entry baki SMS, FIFO balances, offline first, "remind" in one tap (tab 9).
- **How Dakly differs:** baki customers become customers in Dakly with history, so the shop can thank, win back and segment them. Dakly does not try to be a free bookkeeping app.
- Sources: [TallyKhata](https://www.tallykhata.com/en/home-eng/), [TBS feature on TallyKhata](https://www.tbsnews.net/feature/panorama/tallykhata-digitising-culture-buying-and-selling-credit-154465), [Khatabook on Capterra](https://www.capterra.com/p/197475/KhataBook/)

## Courier fraud-check plugins (WordPress, Laravel)

- **What they do:** look up a phone number's delivered and returned parcels across Steadfast, Pathao, RedX and others, show a success ratio, and warn before booking.
- **Problems seen:** most work by logging into courier merchant portals and reading their pages, which breaks when portals change and raises privacy and terms-of-service issues.
- **Dakly decision:** return risk uses only the shop's own parcel history in Dakly (Glossary). If a courier offers an official fraud or success-rate API, Dakly may show it as a separate, labelled signal.
- Sources: [Steadfast API plugin](https://wordpress.org/plugins/steadfast-api/), [Easylife courier check](https://wordpress.org/plugins/easylife-courier-check/), [Laravel fraud-checker package](https://www.v12.packalyst.com/packages/package/azmolla/fraud-checker-bd-courier-laravel)

## Local F-commerce chat automation tools

- **Examples:** FcommerceOS, Fbecha, LazyChat, BikroyBuddy and similar tools for Facebook sellers: auto-replies to "price?" comments, order capture in Messenger, WhatsApp ordering.
- **What Dakly takes:** comment to DM replies, product cards in chat, order capture with confirmation.
- **How Dakly differs:** one customer record across chats, store, counter and baki; consent tracking; attribution; human handover rules.
- Sources: [FcommerceOS](https://youthfireit.com/services/fcommerceos), [F-commerce automation article](https://youthfireit.com/academy/f-commerce-automation-bangladesh), [Fbecha idea page](https://www.turbostarter.dev/ideas/ecommerce/fbecha), [LazyChat](https://www.gappsy.com/tools/lazychat/), [BikroyBuddy case study](https://shahriarlabs.pages.dev/blog/case-study-bikroybuddy)

## Global patterns: ManyChat, respond.io, SleekFlow

- **ManyChat:** keyword and comment triggers that send a DM, growth tools that collect opt-ins, visual flow builder, tags. Dakly copies comment to DM and a simple flow builder (tab 6).
- **respond.io and SleekFlow:** unified inbox across channels, contact lifecycle stages, assignment rules, workflows, WhatsApp broadcast with template management. Dakly copies assignment, handover, "Needs you" and lifecycle stages, simplified for one-person shops.
- **What they don't do for Bangladesh:** SMS with local sender IDs, COD order stages, BD couriers, bKash and Nagad, Bangla-first AI, baki.

## Platform rules that shape the product

| Rule                                                                                                                                                                        | What it means for Dakly                                                                                                   | Source                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WhatsApp is billed per message (since 1 July 2025), by category: marketing, utility, authentication; service replies are free inside the 24-hour window up to Meta's limits | Campaign cost estimates are per message and per category; marketing to BD costs about ৳9 per message, utility about ৳0.45 | [Meta pricing docs](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing), [SleekFlow summary](https://sleekflow.io/blog/whatsapp-business-price)                                                   |
| From 1 Oct 2026 Bangladesh is its own WhatsApp pricing market; service messages beyond 1,000 free per number per month are charged                                          | Show WhatsApp costs from a rate table Dakly updates; warn shops near the free limit                                       | Meta pricing docs                                                                                                                                                                                                                |
| Click-to-WhatsApp ads open a 7-day free window                                                                                                                              | Note for future ads integration                                                                                           | Meta pricing docs                                                                                                                                                                                                                |
| Messenger and Instagram: businesses may reply only within 24 hours of the customer's last message; the Human agent tag allows 7 days for human replies only                 | AI replies stop after 24 hours; DM campaigns only go to people who opted in to updates; humans can reply up to 7 days     | [Messenger 24-hour window](https://www.obi4wan.com/en/facebook-messenger-24-hours-window/), [Human agent tag](https://www.chatwoot.com/hc/user-guide/articles/1745225158-what-is-human-agent-tag-in-instagram-messenger-channel) |
| Steadfast API (portal.packzy.com): create order, status by consignment or invoice id, bulk create up to 500, webhooks                                                       | Bulk booking up to 500 per batch; status by webhook with polling fallback                                                 | [steadfast-python docs](https://steadfast-python.readthedocs.io/en/latest/order_management.html)                                                                                                                                 |

## Ideas parked for later releases

- AI voice call to confirm COD orders (SeloraX does this). Hidden in release 1 by decision; revisit when cost per call and Bangla voice quality are proven.
- Network-wide buyer trust score shared across Dakly shops, with consent and clear rules.
- Pathao Pay and bKash checkout inside the order link.
- Click-to-WhatsApp and Click-to-Messenger ads with attribution.
