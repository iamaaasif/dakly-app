# Frontend structure (Next.js)

The shop app is `apps/web`: Next.js App Router, React 19, TypeScript strict. The admin app (`apps/admin`) follows the same rules.

Other frontend rules:

- [frontend-components.md](frontend-components.md): writing components
- [frontend-styling.md](frontend-styling.md): Tailwind, tokens, shadcn/ui
- [frontend-data-and-state.md](frontend-data-and-state.md): React Query, URL state, client state
- [frontend-forms.md](frontend-forms.md): React Hook Form with shared zod schemas
- [frontend-accessibility.md](frontend-accessibility.md): keyboard, labels, phone width, Bangla text

Sources: [Bulletproof React](https://github.com/alan2207/bulletproof-react) (feature folders, no cross-feature imports, unidirectional imports), the [Next.js App Router docs](https://nextjs.org/docs/app), and the web apps of [Cal.com](https://github.com/calcom/cal.com) and [Dub](https://github.com/dubinc/dub) (a shared UI package, thin route files).

## Folders

```text
apps/web/src/
  app/                       routes only
    (auth)/sign-in/page.tsx
    (app)/layout.tsx         signed-in shell: sidebar, header
    (app)/orders/page.tsx
  features/<name>/
    api/                     one file per endpoint: fetch function + hook
    components/              components used only by this feature
    hooks/                   hooks used only by this feature
    <name>.types.ts          view types this feature needs beyond contracts
  components/                app-wide pieces that are not generic UI (app-shell, store-switcher)
  lib/                       api-client.ts, format-money.ts, format-date.ts, query-client.ts
packages/ui/src/             generic UI: button, input, dialog, table, badge (shadcn/ui based)
```

Imports go one way: `app → features → components → packages/ui, lib`. A feature never imports another feature (`pnpm lint:boundaries`). If two features need the same piece, move it to `components/` (app-specific) or `packages/ui` (generic).

## Route files

A `page.tsx` reads params, checks access, and renders one feature component. Nothing else.

Wrong:

```tsx
export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => {
    fetch('/api/orders')
      .then((r) => r.json())
      .then(setOrders);
  }, []);
  return <table>{/* 200 lines */}</table>;
}
```

Right:

```tsx
export default async function OrdersPage() {
  await requirePermission('orders.view');
  return <OrdersScreen />;
}
```

- Permission checks go in `page.tsx`, never only in `layout.tsx`: layouts do not re-run on client navigation between sibling pages. The API checks again; the page check is for a clear screen, not for security.
- `export default` only where Next.js needs it (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`). Everything else uses named exports. Lint enforces this.
- Every route segment with data has a `loading.tsx` (skeleton) and the `(app)` group has an `error.tsx`.

## Server and client components

- Components are server components by default. Add `'use client'` only to the smallest component that needs state, effects, event handlers or browser APIs.
- Shop data is fetched on the client with React Query through the API (`apps/api`), because every request needs the session cookie checked by the API and the screens update live. Do not call the database or `packages/core` from Next.js.
- Server components may render static shells and read the session for the page check.

## Files and names

- One component per file. File name is kebab-case of the component: `order-status-badge.tsx` exports `OrderStatusBadge`.
- Props type is `<Component>Props`, declared above the component, not exported unless another file needs it.
- No barrel `index.ts`. Import the file directly.
- No `utils.ts`, `helpers.ts`, `common/`, `shared/` folders. Name the file for what it holds.

## Strings

All UI copy is English in release 1 and written in the component, short and plain (see [writing.md](writing.md)). Bangla UI arrives in release 2 through an i18n library; until then do not build a translation layer, and do not put user-facing strings in `lib/` or the API.
