# Styling and theme

Styling is Tailwind CSS v4 with the tokens in [design/theme.md](../design/theme.md), and components from `packages/ui`, which start as [shadcn/ui](https://ui.shadcn.com) copies restyled to our tokens. Sources: shadcn/ui's theming guide, [Tailwind's theme variables](https://tailwindcss.com/docs/theme), and Dub's `packages/ui`.

## Rules

1. Colours, radius, shadows and font sizes come from tokens. No hex, rgb or hsl values in components, and no Tailwind arbitrary values for them (`bg-[#F06306]`, `text-[13.5px]`). Lint rejects hex literals in `.tsx` files.
2. Use the semantic token, not the colour: `bg-primary`, `text-muted`, `border-border`, `text-danger`. Never `bg-orange-600`.
3. Spacing uses the scale in the theme (`p-4`, `gap-3`). Arbitrary spacing (`mt-[13px]`) needs a reason in the PR.
4. No `style={{ ... }}` except for values only known at runtime (a progress width, a chart colour from data).
5. No CSS modules, styled-components, Sass or global CSS beyond `packages/ui/src/theme.css` and the Tailwind entry.
6. Class order is fixed by `prettier-plugin-tailwindcss`. Combine conditional classes with `cn()` from `packages/ui`, never string concatenation.
7. Variants are defined once with `cva` in the `packages/ui` component. A feature passes `variant="danger"`; it does not restyle the button.
8. Phone first: write the base classes for 360 px, then add `md:` and `lg:`. Tables become card lists below `md`.
9. Icons are `lucide-react` at the sizes in the theme. No emoji in the UI.
10. Dark mode is not in release 1. Do not add `dark:` classes; the tokens make it possible later.

Wrong:

```tsx
<button
  className={'text-white rounded-[10px] px-4 py-2 ' + (danger ? 'bg-[#dc4c4c]' : 'bg-[#f06306]')}
  style={{ fontSize: 13.5 }}
>
  Delete
</button>
```

Right:

```tsx
<Button variant={isDanger ? 'danger' : 'primary'}>Delete</Button>
```

## packages/ui

- Holds generic pieces only: Button, Input, Select, Checkbox, Switch, Dialog, Sheet, DropdownMenu, Popover, Tooltip, Tabs, Table, Badge, Card, Skeleton, Toast, Avatar, EmptyState.
- Knows nothing about Dakly data. No `Order`, `Customer` or API calls.
- Each component file exports the component and its props type. No barrel file; import `@dakly/ui/button`.
- Adding a shadcn component: run the shadcn CLI into `packages/ui`, replace its colour classes with our tokens, delete the variants we do not use, and add it in its own PR.

## Numbers and money on screen

- Money always through `formatMoney(amountPoisha)`: `৳3,42,800`, lakh grouping, no decimals unless there are poisha.
- Numbers in tables and KPI cards use `tabular-nums` and are right-aligned in table columns.
- Percent changes show the sign and colour: `+12.1%` in success, `-3.4%` in danger.
