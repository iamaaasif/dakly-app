# Physical Shop: Shop sales, Due book, Khata Scanner, POS

|           |                           |
| --------- | ------------------------- |
| Release   | 2                         |
| Status    | Not planned for release 1 |
| Extension | Physical Shop             |

Release 2 (D1). Do not build any of this in release 1, and do not add tables or options for it "to be ready". This page records what is known so release 2 starts from it.

## Screens

![Shop sales](../design/screenshots/shop-sales.webp)

![Due book](../design/screenshots/due-book.webp)

## Known requirements

- Shop sales: a counter till that works offline on the device and syncs later with visible status. A sale is never lost or counted twice, so the API needs an idempotency key per sale.
- Due book (baki): who owes what, payments against it, reminders by SMS using the shop's SMS credits (D11).
- Khata Scanner: photos of notebook pages read by a vision model into rows the owner reviews before import.
- POS connectors by API or webhook (D6). Release 1 has CSV import only.
- Shop counter staff role sees Shop sales and Due book only.
