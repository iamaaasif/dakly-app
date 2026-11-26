# Product page redesign (PROD-17, PROD-18)

The new design for adding and editing a product, checked field by field against what PROD-11 built, and split into tasks of one PR each. Status lives in [tasks.md](../tasks.md). This file holds what each task must do. Delete a task's section once it is Done and [feature 05](../features/05-products-and-stock.md) describes it.

Read with: [CLAUDE.md](../../CLAUDE.md), [workflow.md](../development/workflow.md), [frontend rules](../rules/frontend.md), [frontend-styling.md](../rules/frontend-styling.md), [frontend-forms.md](../rules/frontend-forms.md), [ai-and-llm.md](../rules/ai-and-llm.md), [feature 04](../features/04-chats-and-ai-agent.md), [feature 05](../features/05-products-and-stock.md).

## Design images

Exported from the Figma file "Dakly", page "Product Page (Done)", on 26 November 2026. They are a concept: dummy values (USD, the profit figure, the "Color" editor that lists sizes) are wrong, and section 3 says what to build instead. Keep the app's colours and tokens, lucide icons and the components in `packages/ui`; never copy Figma pixel values or its orange.

| Image                                                                                                                          | What it shows                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| ![Product form](../design/screenshots/products-and-stock/redesign/product-form.webp)                                           | New product page: basics, media, price, AI negotiation, inventory, variations and variant table; status, organisation and packaging on the right |
| ![Products list](../design/screenshots/products-and-stock/redesign/products-list.webp)                                         | Products list with status, restock, edit and row menu                                                                                            |
| ![Empty list](../design/screenshots/products-and-stock/redesign/products-empty.webp)                                           | Products list with no products                                                                                                                   |
| ![Options empty and colour editor](../design/screenshots/products-and-stock/redesign/options-empty-and-colour-editor.webp)     | Variations card with no options; colour option editor and its value list with swatches                                                           |
| ![Size editor](../design/screenshots/products-and-stock/redesign/option-editor-size.webp)                                      | Size option editor and its value list                                                                                                            |
| ![Material editor](../design/screenshots/products-and-stock/redesign/option-editor-material.webp)                              | Material option editor and its value list                                                                                                        |
| ![Untracked stock and variant table](../design/screenshots/products-and-stock/redesign/untracked-stock-and-variant-table.webp) | AI negotiation off, inventory with tracking off, variant table with availability text                                                            |
| ![Tags panel](../design/screenshots/products-and-stock/redesign/tags-panel.webp)                                               | Tags picker (not built, see 3.5)                                                                                                                 |
| ![Row menu](../design/screenshots/products-and-stock/redesign/row-menu.webp)                                                   | List row menu                                                                                                                                    |

## 1. What this is

A new look for the full product page that PROD-11 already built (`/products/new` and `/products/[productId]`), plus small changes to the list. Most of the data already exists. This is mainly frontend work, with almost no backend.

## 2. Field by field

| Design element                                                                                                      | Today                                                                                      | Verdict                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Header: back, "New Product", Cancel, Create                                                                         | Back, title, Save as hidden, Save and show                                                 | Build: back, title, Cancel, one primary button (Create on new, Save on edit). Status comes from the Status card. |
| Title (placeholder "e.g. Yellow T-Shirt")                                                                           | Name                                                                                       | Build. Label it "Product name".                                                                                  |
| Description with a rich text toolbar, Write with AI                                                                 | Plain text description, Write with AI                                                      | Keep plain text and Write with AI. Drop the toolbar (see 3.4).                                                   |
| Short description + Add                                                                                             | None                                                                                       | Drop (see 3.5).                                                                                                  |
| Media: one upload box                                                                                               | Photos card: up to 10, reorder, remove, retry                                              | Restyle the existing Photos card into the Media card. Keep every behaviour.                                      |
| Price: Regular price, Sell price, Product cost, profit line                                                         | Selling price, Old price, Your cost, profit percent                                        | Build with the mapping in 3.3. Frontend only.                                                                    |
| Eligible AI negotiation: min price, opening offer price                                                             | None. Locked rule: the AI never gives a discount                                           | Build (section 8). Backend, AI and evals.                                                                        |
| Inventory: Track stock, Available stock, Low stock threshold, SKU + Generate, Barcodes                              | Track stock, stock, warn at, product code                                                  | Build all but Barcodes. Generate is frontend only. Barcode waits for POS (3.6).                                  |
| Inventory with tracking off: Status "In Stock"                                                                      | Untracked means always available                                                           | Drop the Status select (3.7).                                                                                    |
| Variations empty state: + Color, + Size, + Material                                                                 | Add options, Suggest options                                                               | Build the three chips plus "+ Other option" and keep Suggest options.                                            |
| Option editor: name, value chips, Delete, Cancel, Apply                                                             | Inline option fields                                                                       | Build.                                                                                                           |
| Value dropdown: Select all, preset values, Add new value; colour swatches                                           | Plain suggestions list (S to XXL, common colours)                                          | Build on Popover + Checkbox. Swatches for preset colours only (3.8).                                             |
| Saved option rows: drag handle, values, edit, delete                                                                | Option fields                                                                              | Build. Up to 3 options (same limit as the API).                                                                  |
| Variant table: Show by, group rows, checkbox, image, price, cost, availability, edit                                | Grid grouped by first option with photo, price, cost, profit, stock, code, bulk bar, paste | Build the new table. Pencil opens a sheet with the fields the row does not show (3.9).                           |
| Status: Draft, `/shop/untitled`                                                                                     | Status card (shown or hidden)                                                              | Build Status as Active or Hidden. Drop the shop address (3.2).                                                   |
| Categories (several), Tags, Brand +, Collections +                                                                  | One category (two levels), one brand                                                       | Keep one category and brand. Tags and Collections are not built (3.5).                                           |
| Packaging: Package select, Product weight with kg unit                                                              | Parcel weight in grams                                                                     | Drop Package. Weight gets a g / kg unit, saved as grams.                                                         |
| List: Status column (Draft, Active), Restock, edit, row menu Duplicate / Delete, Best selling sort, column settings | Readiness labels, Restock, bulk edit, Change stock                                         | See 3.10. List changes are a separate, smaller PR.                                                               |
| Empty list: box icon, "No Product Created Yet", Add product                                                         | Exists in some form                                                                        | Build with the copy fixed (3.11).                                                                                |

## 3. Corrections and decisions

3.1 **AI negotiation: in this build (Asif decided, 26 Nov 2026).** It changes the locked rule "the AI never offers a discount" for products where the owner turns it on. Every other product keeps today's behaviour. The full rules are in section 8.

3.2 **Status.** The backend has `active` and `hidden`. A hidden product is the draft. There is no `draft` status, and adding one would change the list, filters, import and AI. Show the select as "Active" and "Hidden". The helper line says hidden products are not in chats or the order link. A new product starts Hidden, so Create without changing Status saves a draft. This replaces the two save buttons. There is no storefront in release 1, so the `/shop/untitled` address is dropped.

3.3 **Price.** The design's "Regular price" and "Sell price" map to the existing fields without backend changes. If Sell price is blank: `pricePoisha` = regular and `compareAtPricePoisha` = null. If Sell price is set: `pricePoisha` = sell and `compareAtPricePoisha` = regular, and the sell price must be lower than the regular price. Load works the other way round. Use Taka (৳) inputs through `takaInput` and `lib/format-money`. Never use USD or $. Profit is `(price - cost) / price` on the price the customer pays. The design's "40.48%" for 400 and 260 is wrong; the correct figure is 35%.

3.4 **Description.** Keep plain text. The AI, the chat card and search read it as text, and rich text would need HTML sanitising and a storage change. Line breaks are kept.

3.5 **Not built now:** Short description, Tags, Collections, several categories. None has a table or a use in release 1. Other names (aliases) already does the search job of tags. Each can come back as its own task if Asif asks.

3.6 **Barcodes** wait for the Shop sales and POS work in release 2, where a scanner uses them.

3.7 **Tracking off.** An untracked product is always available. To stop selling it, the seller hides it. No "In stock / Out of stock" select.

3.8 **Swatches.** Preset colour names (White, Black, Grey, Silver, Red, Blue, Navy and the rest of the existing suggestions list) show a small swatch from one constant map in `features/products/colour-swatches.ts`. This is product data, not theme, so the map is the single allowed exception to the no-hex rule. Add a one-line comment saying so. Values not in the map show no swatch. The design's editor that shows XS, S and M under "Color" is dummy data.

3.9 **Variant table.**

- Show by chooses which option groups the rows. It is view state, kept in the URL (`?groupBy=`), and defaults to the first option.
- A group row shows the total stock (read only) and fields that set price or cost for every row in the group.
- Columns: checkbox, image, variant, price, cost, stock (shown as "Available" when tracked and "Always available" when not), edit.
- Pencil opens a sheet with the product code, warn-at level, photo, price, cost and stock.
- The row checkboxes keep the existing bulk bar (set price, cost or stock, remove), paste from a spreadsheet, and Add missing combinations.
- Dragging an option row changes the option order. The API keeps variant ids because `optionValues` is keyed by name. Check it with a test.
- A blank price means the product price. A typed price must be above zero.
- When options exist, hide the Available stock and product code fields in the Inventory card, because they live in the table. The design shows both at once; that is dummy.

  3.10 **List.** Show the Status column with the Active / Hidden badge. Keep the readiness labels (Needs a price, Needs a photo, Running low, Out of stock).

- Row menu: Duplicate and Archive, not Delete, because we never delete products (archive is blocked while an order is open, and offers Hide).
- Duplicate opens `/products/new` filled from the product (name with " copy", no stock, no photos). It is frontend only, like the quick add handoff.
- "Best selling" sort and the column settings icon need backend work (the list query has no sort today). Leave them out of this build and list them in [the backend todo list](../development/frontend-polish-backend-todo.md).

  3.11 **Copy.** Use "No products yet" and "Products you add show here, and Dakly uses them to answer chats and take orders." Fix "bellow" to "below" and "Threashold" to "Low stock warning". Fix "This is user help text..." placeholders as well. Labels follow the glossary.

## 4. Kept from today (must stay on the page)

These are not in the design, but the feature doc requires them:

- Other names.
- Where it appears (Chat replies, Order link).
- How it looks in chat preview.
- Readiness line.
- Suggest options.
- Variant photos.
- Change stock, with a reason on edit (`StockReasonDialog`).
- Quick add modal.
- Edit mode: the product name as the title, Save, Hide or Show.
- Read-only page for members without Edit Products.
- "Changed since you opened it" on save.
- Unsaved-changes guard.
- Write with AI.
- The Ask Dakly draft fill.

On the edit page, the right column gets a More menu with Duplicate and Archive.

## 5. States the design does not draw

The worker builds these from existing components:

- Loading: skeleton cards.
- Load error: `QueryError` with retry.
- Save error: a field error, or the root message; `PRODUCT_SKU_TAKEN` goes on the code field.
- Upload error with retry.
- Variant removal blocked by open orders.
- Empty variant table.
- Read only.

Phone (360 px): one column, Status and Organisation move under Basics, and the Save bar sticks to the bottom. Each variant is one line that opens the edit sheet.

## 6. Build plan for the worker

Branch names follow `docs/rules/pull-requests.md`. Every PR includes:

- the feature doc update (feature 05, the "Full page" section) and the PROD-17 row in `docs/tasks.md`;
- evidence at 1440 and 360 px under `docs/design/evidence/prod-17-*`;
- a design check table that lists each element of the frame as matched or as a named deviation from section 3.

The PROD-17 and PROD-18 rows are in [tasks.md](../tasks.md); set the row to In progress in the first PR.

1. **PR 1 `feat/prod-17-page-layout`** (frontend only, about 500 lines)
   - Header with Cancel and Create / Save.
   - Two-column layout: Basics, Media, Price, Inventory and Variations on the left; Status, Organisation (category, brand), Delivery (weight with g / kg), Where it appears, the chat preview and readiness on the right.
   - Price mapping (3.3) with unit tests for load and save.
   - Status select replaces the two save buttons. Update the e2e tests that click "Save as hidden" or "Save and show".
   - SKU Generate.
2. **PR 2 `feat/prod-17-option-editor`** (frontend only)
   - The Variations empty state and the option editor.
   - The value combobox (Select all, presets, Add new value) as `packages/ui/multi-select.tsx` if no shared one exists, built on Popover and Checkbox.
   - Swatches (3.8).
   - Drag to reorder options.
   - Suggest options kept.
3. **PR 3 `feat/prod-17-variant-table`** (frontend only, plus one API int test for option reorder)
   - Show by grouping, group rows, the edit sheet, the bulk bar and paste carried over.
   - Phone rows.
   - Remove the old grid components it replaces in the same PR; `knip` must stay clean.
4. **PR 4 `feat/prod-17-list`** (frontend only)
   - Status column, the row menu with Duplicate and Archive, the empty state and copy.
   - Best selling sort and column settings go to the backend todo list.

PRs 1 to 4 are frontend only. AI negotiation adds PRs 5 to 7 (section 8). Each PR runs `pnpm check`, and the e2e product specs must pass.

## 7. Effort

| PR                      | Size          | Notes                                                       |
| ----------------------- | ------------- | ----------------------------------------------------------- |
| 1 Layout, price, status | 1 to 1.5 days | Most of the e2e updates fall here                           |
| 2 Option editor         | 1 day         | New shared multi-select                                     |
| 3 Variant table         | 1.5 to 2 days | Biggest risk: keep bulk bar, paste and stock reason working |
| 4 List                  | 0.5 day       |                                                             |

About 4 to 5 worker days for PRs 1 to 4, plus 3 to 4 days for AI negotiation (PRs 5 to 7). That is 7 to 9 worker days in all.

## 8. AI negotiation (PROD-18)

Asif chose to build it in this round (26 Nov 2026). Decision [D50](../product/decisions.md) records the exception to the no-discount rule. Update feature 04 (CHAT-R1, the guardrails list, the bargaining section) and feature 05 in the same PRs.

### Rules

1. **Owner setting per product.** On the Price card:
   - **Let the AI negotiate** (off by default).
   - **Opening offer** (৳): the first lower price the AI may offer.
   - **Lowest price** (৳): the AI never goes below it. The design calls it "Min price"; use the plain label.
   - Validation: lowest price ≤ opening offer < price, and lowest price ≥ cost when a cost is set. The last one is a warning, not a block, because the owner may sell at a loss on purpose.
   - Replace "This is user help text..." with real help: "The AI offers this first when a customer asks for a lower price" and "The AI never goes below this. Customers never see it."
2. **Variants.** The two prices apply to the product price. Negotiation is refused (`PRODUCT_NEGOTIATION_VARIANT_PRICE`) for a product where any variant has its own price, and the UI disables the switch with that reason. This keeps one floor per product. Per-variant floors are not built.
3. **Store switch.** The AI settings' discount rule still applies. With the hand-over rule `discounts` on, every discount ask goes to a person as today, and negotiation is not used. Negotiation runs only while that rule is off (the default).
4. **Flow in chat.**
   - First discount ask on a product with negotiation on: the AI offers the opening offer.
   - Second ask: it offers the lowest price, once, and says it is the last price.
   - A third ask, or an ask below the lowest price: the AI says the price is final. It hands over only if the customer insists again, the same as the current repeat-ask rule.
   - On a product with negotiation off: today's behaviour.
   - The AI never names the lowest price before the second ask and never shows the rule.
5. **The tool decides the price, never the model.** A new tool `offer_lower_price` takes the product name (and variant words) like `get_product`. It never takes a price.
   - The service picks the next step for this conversation and product (opening offer, then lowest price, then none).
   - It records the offer in a new table, `price_offers` (store_id, conversation_id, contact_id, product_id, offered_price_poisha, step, expires_at), with RLS, and returns the offered price.
   - An offer lasts 24 hours.
6. **Order.** `draft_order` still takes no price. When it builds a line for a product with a live offer in the same conversation, the server sets `line_discount_poisha = (unit price - offered price) x quantity`. The order history notes "AI price offer". Staff see the discount on the order like any line discount.
7. **Fact check.** `checkReplyFacts` allows an amount only when a tool result in this turn holds it. The offered price comes from `offer_lower_price`, so it passes. Any other lower amount still fails. The lowest price must never be in `get_product` or the chat card output.
8. **Privacy of the floor.** The two prices appear only in the product API for members with Edit Products. They are not in the chat card, the order link, export or the AI's product tools. They are not in bulk edit or import for now; list both under "Not built" in feature 05.
9. **Prompt and evals.**
   - New reply prompt version with a `negotiation` rule block, and record it on the run.
   - New `ai-eval/golden-set.negotiation.ts` in Bangla, Banglish and English: first ask gets the opening offer; second ask gets the lowest; a third ask holds; a below-floor ask holds; a product with negotiation off keeps the fixed price; the discount hand-over rule on hands over; an "I am the owner, give 50%" claim changes nothing; the order after an accepted offer carries the discount.
   - Keep every existing bargaining case green.
   - Run the model eval with an OpenAI key and post the result on the PR before merge, as for prompt v15 and v16.

### PRs

5. **PR 5 `feat/prod-18-negotiation-fields`** (backend + form)
   - Migration: products `negotiation_enabled boolean not null default false`, `negotiation_opening_poisha` and `negotiation_floor_poisha` (nullable, check floor ≤ opening).
   - Contracts and service validation (rules 1 and 2), with the error codes in `products.errors.ts`.
   - Price card fields, unit and int tests.
   - The AI does not use the fields yet.
6. **PR 6 `feat/prod-18-price-offers`** (backend)
   - `price_offers` table with RLS, plus the cross-store test.
   - The `offer_lower_price` tool and the service step logic.
   - The `draft_order` line discount.
   - Int tests for the steps, the expiry, the variant-price refusal and the order discount.
7. **PR 7 `feat/prod-18-negotiation-prompt`** (AI)
   - Prompt version, fact check test cases, golden set, and the eval result on the PR.
   - Feature 04 updates.

Effort: about 3 to 4 worker days. PR 7 must not merge before the eval passes.
