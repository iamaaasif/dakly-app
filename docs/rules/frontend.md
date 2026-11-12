# Frontend (Next.js)

```text
apps/web/src/
  app/                 routes only: thin page.tsx files
  features/<name>/
    api/               one file per API call: fetch function + React Query hook
    components/        components used only by this feature
    hooks/             hooks used only by this feature
  components/          shared layout and UI pieces
  lib/                 api-client, formatting
```

- A route file checks access and renders one feature component. Permission checks go in `page.tsx`, not `layout.tsx`.
- A feature never imports another feature. Shared code moves to `components/` or `lib/`. Checked by `pnpm lint:boundaries`.
- Server data lives in React Query. Filters and tabs live in the URL. Global client state only for real UI state (an open panel), and only when needed.
- Forms use React Hook Form with the zod schema from `@dakly/contracts`, the same one the API uses.
- Money is shown with one formatter (`৳1,250`); never format inline.
- Every user-facing string will go through the i18n layer once Bangla UI starts (release 2); keep strings in components, not in services.
