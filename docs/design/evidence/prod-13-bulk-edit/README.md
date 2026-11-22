# PROD-13 bulk edit: design evidence

Screens from the products list with mocked data, at 1440 and 360 wide, compared with `docs/design/wireframes/prod-11/list-bulk-edit-1440.png`.

| File                    | Shows                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `undo-notice-*.png`     | Undo notice for the last bulk edit, above the list with its row checkboxes                                                                |
| `list-selected-*.png`   | Four rows selected and the bar: count, Edit in grid, Hide, Set category, Clear                                                            |
| `grid-*.png`            | The grid. Cotton Panjabi has two sizes, so cost and stock are read-only. Linen shirt has a size with its own price, so price is read-only |
| `grid-scrolled-360.png` | At 360 the grid scrolls sideways with the Product column fixed; this shows Category and Status                                            |
| `review-*.png`          | Changed cells in bold with the old value, the stock reason, and the review step with Apply and the undo note                              |

Differences from the wireframe: no Brand column or brand filter (brands arrive with PROD-12), no "Select all matching the filters", and the round "N" in the lower left is the Next.js development button. The browser console had no errors or warnings in these runs.
