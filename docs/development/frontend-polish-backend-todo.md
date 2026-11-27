# Frontend polish: backend notes

Backend changes the frontend polish work found it needs. The polish developer adds entries here and does not make the changes. See [frontend-polish.md](frontend-polish.md).

Entry format:

```text
### <short title>

- Screen: <route and design image>
- Missing: <what the screen cannot do or show today>
- Why: <what the person using the screen gets from it>
- Expected API: <method and path, request fields, response fields>
- Workaround in the UI: <what the screen does until then>
```

## Entries

The three entries from the auth screens were built in ACC-19 parts 5 and 6: sign-up saves the source, business name, website and offering and creates the first shop, Continue with Facebook is a real redirect flow, and the reset code error shows on the password step. See [01-account-and-team.md](../features/01-account-and-team.md).

### Unsaved changes in the app shell

- Screen: the app shell on pages with an editor.
- Missing: a shared prompt before navigation discards edits, including browser Back and Forward.
- Why: sellers can stay on the page and save when they navigate by mistake.
- Expected API: none. The app shell handles the navigation.
- Workaround in the UI: the product editor saves when the seller presses Create or Save.

### Product column settings

- Screen: `/products`, [products list design](../design/screenshots/products-and-stock/redesign/products-list.webp)
- Missing: The products list has no saved column preferences.
- Why: A seller can keep the columns they use visible and reclaim space from the others.
- Expected API: Read and update the visible product column keys. The endpoint and whether preferences belong to a shop or a member need to be defined before implementation.
- Workaround in the UI: The list shows its standard columns.
