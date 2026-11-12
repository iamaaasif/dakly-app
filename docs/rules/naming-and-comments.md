# Naming and comments

## Files and names

| Thing      | Pattern                          | Example                                                                      |
| ---------- | -------------------------------- | ---------------------------------------------------------------------------- |
| Files      | kebab-case with a role suffix    | `orders.service.ts`, `create-order.dto.ts`, `send-order-confirmation.job.ts` |
| Classes    | PascalCase matching the file     | `OrdersService`                                                              |
| Functions  | verb + domain noun               | `markOrderPaid`, `calculateDeliveryCharge`                                   |
| Booleans   | `is`, `has`, `can`               | `isCashOnDelivery`                                                           |
| Constants  | SCREAMING_SNAKE_CASE             | `MAX_ATTACHMENT_BYTES`                                                       |
| Types      | PascalCase, props end in `Props` | `CustomerResponse`, `OrderTableProps`                                        |
| DB columns | snake_case                       | `store_id`, `amount_poisha`                                                  |

- Full words: `conversation`, not `conv`; `customer`, not `cust`.
- Domain words from the PRD glossary: Store, Customer, Chat, Order, Parcel, Due.
- No filler: `Manager`, `Handler`, `Helper`, `Util`, `Data`, `Info`, `Enhanced`, `Advanced`.
- No generic `utils.ts`. Name the file for what it holds: `phone.ts`, `money.ts`.

## Comments

Comment only the why: a business rule from the PRD, a vendor quirk, a security reason, a workaround. One to three lines.

Wrong:

```ts
// Get the customer by id
const customer = await this.customersRepository.findById(storeId, id);
```

Right:

```ts
// Meta resends a webhook if we answer after 5 seconds, so we only enqueue here.
await this.webhookQueue.add(PROCESS_META_WEBHOOK, payload);
```

No JSDoc blocks on functions whose name and types already say what they do. No commented-out code. A TODO needs an issue link.
