# Glossary

One definition for every word and number. Code, screens and docs use these words and compute these numbers this way (decision D13). If a screen needs a number that is not here, add it here first.

## Words

| Word           | Meaning                                                                                                                       | In code                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Store          | One shop on Dakly. Every row of shop data belongs to one store. A user may belong to several stores.                          | `store`, `storeId`     |
| Member         | A user's place in one store, with a role                                                                                      | `membership`           |
| Contact        | A person in one store, known by a phone, a channel identity, or both                                                          | `contact`              |
| Lead           | A contact with a phone and no delivered order                                                                                 | `kind: 'lead'`         |
| Customer       | A contact with at least one delivered order                                                                                   | `kind: 'customer'`     |
| Not a customer | A contact staff marked as not a buyer (a courier rider, a supplier). Excluded from AI, segments and campaigns.                | `kind: 'not_customer'` |
| Channel        | Messenger, Instagram, WhatsApp, SMS                                                                                           | `channel`              |
| Chat           | One conversation with one contact on one connected channel account                                                            | `conversation`         |
| Window         | The 24 hours after a customer's last message when Meta lets the shop reply freely                                             | `windowExpiresAt`      |
| Hand-over      | The AI stops and asks a person to answer, with a reason                                                                       | `handover`             |
| Order          | Items, a phone and an address, with a stage and a payment status                                                              | `order`                |
| Stage          | Where an order is in fulfilment: To confirm, On hold, To pack, With courier, Delivered, Partly delivered, Returned, Cancelled | `stage`                |
| COD            | Cash on delivery. The courier collects and pays the shop later.                                                               | `cod`                  |
| Advance        | Part of the price paid before shipping, by bKash, Nagad or card                                                               | `advance`              |
| Parcel         | One courier shipment for one order                                                                                            | `shipment`             |
| Consent        | A contact's yes or no to marketing on one channel. The latest answer wins.                                                    | `consent`              |
| Transactional  | A message about the contact's own order. Needs a phone, not marketing consent.                                                | `transactional`        |
| Quiet hours    | 9 pm to 9 am store time by default. Marketing waits; transactional messages do not.                                           | `quietHours`           |
| Segment        | A saved rule that picks contacts                                                                                              | `segment`              |
| Campaign       | One message sent to a frozen audience once, after approval                                                                    | `campaign`             |
| Automation     | A recipe that sends messages when a contact does something                                                                    | `automation`           |
| Baki / Due     | Money a customer owes a physical shop (release 2)                                                                             | `due`                  |
| Poisha         | 1/100 of a Taka. All money in code and the database is an integer number of poisha.                                           | `amountPoisha`         |

## Numbers

| Number                       | Definition                                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI conversation (usage unit) | One contact, one 24-hour window, at least one AI reply. The first AI reply in a window uses 1; later replies in that window use 0. Saved replies and staff replies use 0.                    |
| Money from marketing         | Sales from orders placed within the attribution window (default 7 days) after a contact tapped or read a Dakly message or post. Last touch wins. Cancelled and returned orders are excluded. |
| Orders from chats            | Orders whose source is a chat, counted on the day they were created                                                                                                                          |
| AI-handled chats             | Share of new chats in the period that got an AI reply and no staff reply within 24 hours                                                                                                     |
| Repeat purchase rate         | Customers with 2 or more delivered orders ÷ all customers                                                                                                                                    |
| One-time buyer               | Exactly 1 delivered order                                                                                                                                                                    |
| Regular                      | 2 or more delivered orders, the last within 60 days                                                                                                                                          |
| Stopped buying               | At least 1 delivered order and none in the last 60 days                                                                                                                                      |
| New customer                 | First delivered order in the period                                                                                                                                                          |
| Net spend                    | Delivered item totals minus returns and refunds, in poisha                                                                                                                                   |
| Return risk                  | From the shop's own parcels only (decision D12): Low, Medium or High by the contact's return share and count                                                                                 |
| Reachable                    | Contacts with consent for the channel, a valid address for it, not blocked and not Not a customer                                                                                            |
| Tap rate                     | Unique contacts who tapped a tracked link ÷ delivered messages                                                                                                                               |
| Return per ৳1                | Money from marketing for the campaign ÷ its cost                                                                                                                                             |

## Formats

- Money: `৳` then the amount with lakh grouping, no decimals unless the amount has poisha: `৳3,42,800`, `৳1,250.50`. One formatter in the web app does this.
- Phone: stored `01712345678`; shown `01712-345678`; masked `01712-XXX678` for roles without the full-phone flag.
- Dates: Asia/Dhaka. Today and yesterday by name, then `7 Nov`, then `7 Nov 2025` for other years.
- Times: `10:03 am`.
