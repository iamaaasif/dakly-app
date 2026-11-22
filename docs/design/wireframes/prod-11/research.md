# Product form research (PROD-11)

Checked on 22 Nov 2026 from vendor docs and public help pages. Kirki eCommerce has no public variant documentation (its WordPress.org page lists shop and product pages only), so it is left out of the table. Marketplace tools such as Daraz showed no public variant screens either.

## What others do

| Tool                                                                                       | Good                                                                                                                                             | Weak                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Shopify](https://help.shopify.com/manual/products/variants/edit-variants)                 | Variants are edited on the product page, grouped by the first option, with checkboxes and a bulk edit for the chosen rows. Up to 2,048 variants. | Stock for a product with variants is edited somewhere else. The bulk editor cannot add variants. Variant order is by drag only.                                                                 |
| [WooCommerce](https://woocommerce.com/feature-request/variable-product-backend-ux)         | Generates every combination from attributes.                                                                                                     | Add attributes, save, switch tab, generate, then open each variation one by one. Three colours and four sizes is twelve forms. A combination that was never generated has no row to edit later. |
| [FluentCart](https://docs.fluentcart.com/guide/product-types-creation/advanced-variations) | Option rows (name and values) generate all combinations on save, with a plain table mode for simple cases.                                       | Switching between the two modes deletes existing variations and cannot be undone.                                                                                                               |
| [Square](https://square.com/help/us/en/article/6689)                                       | Reusable option sets (Size, Colour) generate variations in one step. Each variation has its own price, cost and code.                            | Editing an item that already has several variations is web only, not in the phone app.                                                                                                          |
| Lazada and Daraz                                                                           | Add variation, then fill price, code and stock per row.                                                                                          | No public screens to compare.                                                                                                                                                                   |

## What Dakly keeps and adds

Keep: up to three options, renaming an option keeps variant ids, prices, codes and stock; blank price uses the product price; a photo for each variant; stock changes go through the stock history with a reason; Hide and Show; Write with AI.

Add:

1. One screen, no save-and-switch step. Typing option values builds the grid at once.
2. Reusable value suggestions (S, M, L, XL, XXL; common colours) so a seller taps instead of types.
3. Rows are grouped by the first option and can be collapsed, so 3 colours by 5 sizes is three groups, not fifteen loose rows.
4. Row checkboxes and one bulk bar: set price, cost or stock for the chosen rows. Spreadsheet paste into the grid.
5. A removed combination can be added back with **Add missing combinations**, which WooCommerce lacks.
6. Stock for every variant is edited in the grid, with the ledger reason asked once for the whole save. Shopify splits this out.
7. A phone layout that shows each variant as one line (name, price, stock) and opens the row to edit, not five inputs per card. The bulk bar works on a phone too.
8. Profit percent per row and a readiness line (photo, price, description) because the AI needs them.
9. Adding options to a product that already has stock never deletes anything. Existing stock goes to the first value of the new option, and the seller is told.
10. Suggest options from the title and photos (a size set for the product type, colours seen in the photos), shown as chips the seller accepts or removes. Nothing is added without a tap, and the AI never fills price or stock. None of the tools above do this.
