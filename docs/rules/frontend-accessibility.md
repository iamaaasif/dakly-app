# Accessibility and phone use

Most owners and staff use Dakly on a mid-range Android phone over mobile data. Build for that first. Sources: [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/), the [Radix accessibility notes](https://www.radix-ui.com/primitives/docs/overview/accessibility), and the [web.dev Core Web Vitals](https://web.dev/articles/vitals) targets.

## Rules

1. Every page works at 360 px wide with no sideways scroll. Check it before opening the PR.
2. Tap targets are at least 40 × 40 px.
3. Everything works with a keyboard: tab order follows the screen, focus is visible (`focus-visible` ring from the theme), dialogs trap focus and return it on close. `packages/ui` components handle this; do not rebuild them.
4. Clickable things are `<button>` or `<a>`. Never a clickable `div`.
5. Every input has a visible label. Placeholder text is not a label.
6. Icon-only buttons have an `aria-label` ("Open notifications").
7. Status is not shown by colour alone: a badge has text ("Failed"), not just a red dot.
8. Text contrast meets AA with the theme tokens (see [theme.md](../design/theme.md)).
9. Bangla text: the font stack includes Noto Sans Bengali; give Bangla text room (line height at least 1.5) and never truncate a customer message mid-word without a way to see all of it.
10. Images have `alt` text; product photos use the product name.
11. Pages load fast on 4G: Largest Contentful Paint under 2.5 s, no layout shift from late images (set width and height), `next/image` for product photos, route-level code splitting by default.
12. Toasts are for confirmation only. Errors that need action stay on the screen until fixed.
