# Theme

The tokens Dakly's web app is built from. Values were measured from the design prototype and rounded to a small set. Components use the token names, never the raw values. The tokens are defined once as CSS variables in `packages/ui/src/theme.css` and exposed to Tailwind through `@theme` (task WEB-1 in [tasks.md](../tasks.md)).

## Colour

| Token                   | Light     | Use                                                        |
| ----------------------- | --------- | ---------------------------------------------------------- |
| `--color-background`    | `#FAF9F5` | Page background                                            |
| `--color-surface`       | `#FFFFFF` | Cards, panels, inputs                                      |
| `--color-surface-muted` | `#F3EFEB` | Table headers, selected rows, quiet fills                  |
| `--color-border`        | `#EEE8E3` | Card and input borders                                     |
| `--color-border-strong` | `#DDD7D2` | Input borders on focus-free state, dividers that must show |
| `--color-text`          | `#211A16` | Body text, headings                                        |
| `--color-text-muted`    | `#766C65` | Secondary text, labels, captions                           |
| `--color-text-subtle`   | `#A79D96` | Placeholders, disabled text                                |
| `--color-primary`       | `#F06306` | Primary buttons, active nav, links                         |
| `--color-primary-hover` | `#C24F04` | Primary hover, link text on light fills                    |
| `--color-primary-soft`  | `#FEF0E6` | Active nav background, highlighted cards                   |
| `--color-on-primary`    | `#FFFFFF` | Text on primary                                            |
| `--color-inverse`       | `#211A16` | Dark buttons (Ask Dakly AI, AI agent), toasts              |
| `--color-success`       | `#14663D` | Positive change, "AI is handling", delivered               |
| `--color-success-soft`  | `#E6F4EC` | Success badges and banners                                 |
| `--color-warning`       | `#8A5A00` | Needs attention, running low                               |
| `--color-warning-soft`  | `#FDF3DC` | Warning badges                                             |
| `--color-danger`        | `#B4231A` | Errors, destructive actions, failed                        |
| `--color-danger-soft`   | `#FDECEA` | Error banners                                              |
| `--color-info`          | `#1F4FA3` | Neutral information, links in tables                       |
| `--color-info-soft`     | `#E4ECFA` | Info badges                                                |
| `--color-ai`            | `#7A2B8A` | The AI badge and AI-written labels                         |
| `--color-ai-soft`       | `#F1E3F6` | AI badge background                                        |

Channel colours (Messenger blue, WhatsApp green, Instagram gradient) appear only in channel icons, never as UI colours.

Dark mode is not in release 1. Keep every colour behind a token so it can be added without touching components.

Contrast: text on its background meets WCAG AA (4.5:1 for body, 3:1 for 18 px and up). `--color-primary` on white is about 3.4:1, so white text on a primary button must be 14 px semibold or larger, and primary-coloured body text uses `--color-primary-hover`.

## Type

Font: Inter, with `"Noto Sans Bengali"` next in the stack so Bangla AI output and customer names render well. Load both with `next/font`.

| Token       | Size / line height | Weight | Use                                |
| ----------- | ------------------ | ------ | ---------------------------------- |
| `text-xs`   | 12 / 16            | 500    | Badges, table captions, timestamps |
| `text-sm`   | 13 / 20            | 400    | Secondary text, table cells        |
| `text-base` | 14 / 22            | 400    | Body, inputs, buttons              |
| `text-md`   | 16 / 24            | 600    | Card titles, dialog titles         |
| `text-lg`   | 20 / 28            | 650    | Section headings                   |
| `text-xl`   | 28 / 34            | 700    | Page titles                        |
| `text-2xl`  | 36 / 42            | 700    | Dashboard numbers, greeting        |

Weights: 400, 500, 600, 700 only. Numbers in tables and KPI cards use `tabular-nums`.

## Space, radius, shadow

- Space: Tailwind's 4 px scale. Use 1, 2, 3, 4, 6, 8, 12 (4 px to 48 px). Page padding is 6 on phone and 8 on desktop.
- Radius: `--radius-sm` 6 px (badges, inputs inside tables), `--radius-md` 8 px (buttons, inputs), `--radius-lg` 12 px (cards, panels), `--radius-full` for pills and avatars.
- Shadow: cards use a border, not a shadow. `--shadow-overlay` only for menus, popovers, dialogs and toasts.

## Layout

- Sidebar 248 px on desktop, icons only at 64 px when collapsed, a sheet on phone.
- Content max width 1280 px; forms max 640 px.
- Breakpoints: Tailwind defaults. Design phone first (360 px), then `md` (768) and `lg` (1024).

## Icons

`lucide-react`, 16 px in buttons and tables, 20 px in nav, stroke width 1.75. No emoji in the UI.
