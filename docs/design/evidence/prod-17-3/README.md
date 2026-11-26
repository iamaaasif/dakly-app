# Variant table design check

The product variants browser spec captures the grouped table, edit sheet and stock reason at 1440 and 360 pixels.

| Frame element                     | Implementation                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Show by                           | Changes grouping in the URL and starts with the first option.                                                                 |
| Group rows                        | Collapse to hide their variants. Group price and cost apply to all rows in the group. The available stock total is read-only. |
| Desktop variant rows              | Show the selection checkbox, photo, name, price, cost, available stock and edit button.                                       |
| Tracked and untracked stock       | Tracked stock shows the quantity available. Untracked variants show Always available, following section 3.7 of the plan.      |
| Edit pencil                       | Opens the sheet for product code, warning level, photo, price, cost and stock. Profit is shown in the sheet.                  |
| Phone variant rows                | Each variant fits on one row that opens the sheet.                                                                            |
| Bulk controls                     | Row checkboxes, spreadsheet paste and Add missing combinations follow section 3.9.                                            |
| Stock reason                      | Saving stock changes asks for one reason, as required in section 4.                                                           |
| Group selection, photo and pencil | Individual selection and editing follow section 3.9. Groups provide shared price and cost controls.                           |
