# 0012: Add and edit products on a full page

- Status: proposed
- Date: 2026-11-22

## Context

The prototype adds a product in a modal and edits it in a side drawer. A product holds photos, prices, options, variants with their own prices and stock, and a description. The variants need width. A 420 px modal and a 330 px drawer cannot show a grid, so variants became tall cards of about 300 px each (issues #496 and #497). A modal also moves under the cursor as it grows, has no back button or shareable link, and has no Save bar that stays in view. On a phone the modal is already a full screen.

The screenshots in `docs/design/` are layout references from a prototype. Leaving them is allowed, but replacing a container is a product decision, so it is recorded here.

## Decision

Two tiers:

- Quick add stays a modal with name, price, stock and one photo, plus a **More details** link that opens the full page with those values filled in. It is for adding a product in about 20 seconds.
- The full page lives at `/products/new` and `/products/[productId]`. It has a top bar that stays in view (back, title, Save, Hide), two columns on desktop and one on a phone, and a variants grid with one row per size or colour combination. Rows are grouped by the first option, edited in place, and changed in bulk through row checkboxes. The research is in `docs/design/wireframes/prod-11/research.md`: Shopify groups and bulk edits but splits stock out, WooCommerce needs a save and a tab switch and loses ungenerated combinations, and FluentCart deletes variations when its mode is switched. Dakly keeps one screen, never deletes on a change, and edits stock in the same grid.

Restock and Change stock stay dialogs, because they are quick actions. The product drawer and the add modal's long form are removed once the page ships.

Nothing changes in the API, the contracts or the database. The page uses the same product, variant, photo and stock endpoints.

## Consequences

The variants grid, a link that can be shared, and a Save bar that stays in view become possible. The page needs a real form state for photos and variants, so unsaved changes ask before leaving. A draft that survives a reload is not part of this change: a hidden product already keeps an unfinished product on the server.

Four parts, each under 1,000 lines: page shell with basics and photos; variants grid; quick add; remove the old modal and drawer. Revisit if sellers on phones find the grid harder than the cards it replaces.
