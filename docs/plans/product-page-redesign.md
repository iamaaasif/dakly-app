# Product page redesign (PROD-17)

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
| Eligible AI negotiation: min price, opening offer price                                                             | None. Locked rule: the AI never gives a discount                                           | See [Price negotiation settings](../features/05-products-and-stock.md#price-negotiation-settings-prod-18).       |
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

3.1 **AI negotiation: in this build (Asif decided, 26 Nov 2026).** It changes the locked rule "the AI never offers a discount" for products where the owner turns it on. Every other product keeps today's behaviour. [Price negotiation settings](../features/05-products-and-stock.md#price-negotiation-settings-prod-18) explains how it works.

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

3.12 **Product version check.** A product version check on save is a separate API task. See the [backend todo list](../development/frontend-polish-backend-todo.md).

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

The PROD-17 row is in [tasks.md](../tasks.md); set the row to In progress in the first PR.

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

PRs 1 to 4 are frontend only. Each PR runs `pnpm check`, and the e2e product specs must pass.

## 7. Effort

| PR                      | Size          | Notes                                                       |
| ----------------------- | ------------- | ----------------------------------------------------------- |
| 1 Layout, price, status | 1 to 1.5 days | Most of the e2e updates fall here                           |
| 2 Option editor         | 1 day         | New shared multi-select                                     |
| 3 Variant table         | 1.5 to 2 days | Biggest risk: keep bulk bar, paste and stock reason working |
| 4 List                  | 0.5 day       |                                                             |

About 4 to 5 worker days for PRs 1 to 4.
