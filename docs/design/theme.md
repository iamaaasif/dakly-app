# Theme

The tokens Dakly's web app is built from. Values were measured from the design prototype and rounded to a small set. Components use the token names, never the raw values. The tokens are defined once as CSS variables in `packages/ui/src/theme.css` and exposed to Tailwind through `@theme` (task WEB-1 in [tasks.md](../tasks.md)).

## Colour

| Token                    | Light     | Use                                                                                    |
| ------------------------ | --------- | -------------------------------------------------------------------------------------- |
| `--color-background`     | `#FAF9F5` | Page background                                                                        |
| `--color-surface`        | `#FFFFFF` | Cards, panels, inputs                                                                  |
| `--color-surface-muted`  | `#F3EFEB` | Table headers, selected rows, quiet fills                                              |
| `--color-border`         | `#EEE8E3` | Decorative card borders                                                                |
| `--color-border-strong`  | `#DDD7D2` | Decorative dividers only                                                               |
| `--color-text`           | `#211A16` | Body text, headings                                                                    |
| `--color-text-muted`     | `#766C65` | Secondary text, labels, captions                                                       |
| `--color-text-subtle`    | `#A79D96` | Disabled or decorative text only                                                       |
| `--color-primary`        | `#F06306` | Decorative brand accent                                                                |
| `--color-primary-hover`  | `#C24F04` | Brand text on white only                                                               |
| `--color-primary-soft`   | `#FEF0E6` | Active nav background, highlighted cards                                               |
| `--color-action`         | `#C24F04` | Interactive fills and link text on white or page background                            |
| `--color-action-hover`   | `#A84303` | Primary button hover                                                                   |
| `--color-focus`          | `#C24F04` | Focus outline on white or page background                                              |
| `--color-input-border`   | `#8F8178` | Essential input and secondary button boundaries                                        |
| `--color-danger-hover`   | `#961D15` | Destructive button hover                                                               |
| `--color-on-primary`     | `#FFFFFF` | Text on primary                                                                        |
| `--color-inverse`        | `#211A16` | Dark buttons (Ask Dakly AI, AI agent), toasts                                          |
| `--color-success`        | `#14663D` | Positive change, "AI is handling", delivered                                           |
| `--color-success-soft`   | `#E6F4EC` | Success badges and banners                                                             |
| `--color-warning`        | `#8A5A00` | Needs attention, running low                                                           |
| `--color-warning-soft`   | `#FDF3DC` | Warning badges                                                                         |
| `--color-danger`         | `#B4231A` | Errors, destructive actions, failed                                                    |
| `--color-danger-soft`    | `#FDECEA` | Error banners                                                                          |
| `--color-info`           | `#1F4FA3` | Neutral information, links in tables                                                   |
| `--color-info-soft`      | `#E4ECFA` | Info badges                                                                            |
| `--color-facebook`       | `#1665D8` | The Continue with Facebook button (white text, 5.4:1)                                  |
| `--color-facebook-hover` | `#1255B3` | Hover fill of the Facebook button                                                      |
| `--color-instagram`      | `#B82D7C` | Instagram channel icon (white icon, 5.7:1; the single pink stands in for the gradient) |
| `--color-ai`             | `#7A2B8A` | The AI badge and AI-written labels                                                     |
| `--color-ai-soft`        | `#F1E3F6` | AI badge background                                                                    |

Channel colours (Messenger blue, WhatsApp green, Instagram gradient) appear only in channel icons, never as UI colours.

Dark mode is not in release 1. Keep every colour behind a token so it can be added without touching components.

Normal text needs at least 4.5:1 contrast. The 3:1 large-text exception starts at 18 pt (24 CSS px), or 14 pt (about 18.67 CSS px) bold; 14 px semibold does not qualify. See [W3C contrast minimum](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum).

The brand orange on white measures 3.235:1 and is decorative. White text uses the action fill (4.758:1), its hover fill, or danger fills. Muted text on white is 5.118:1; use muted for placeholders on white inputs. Muted on surface-muted is only 4.474:1, so neutral badges use the main text token. Subtle text on white is 2.656:1 and is restricted to disabled or decorative content. The strong decorative border on white is 1.426:1; essential boundaries use input-border instead. Focus uses a 2 px outline with a 2 px offset so it sits against the surrounding white or page background.

Status badges pair each status text token with its matching soft fill (all exceed 5.3:1). Essential input boundaries exceed 3.5:1 against white and the page background. Do not use action text on primary-soft: that pair falls below 4.5:1. Use action-hover text there instead.

## Type

Font: Inter, with `"Noto Sans Bengali"` next in the stack so Bangla AI output and customer names render well. Load both with `next/font`. Bangla-tagged content, including inherited language, uses 1.5 line height for heading defaults. Explicit leading must keep at least that minimum; larger unitless or fixed leading is preserved. Nested English content uses the original sizes and line heights below.

| Token       | Size / line height | Weight | Use                                |
| ----------- | ------------------ | ------ | ---------------------------------- |
| `text-xs`   | 12 / 18            | 500    | Badges, table captions, timestamps |
| `text-sm`   | 13 / 20            | 400    | Secondary text, table cells        |
| `text-base` | 14 / 22            | 400    | Body, inputs, buttons              |
| `text-md`   | 16 / 24            | 600    | Card titles, dialog titles         |
| `text-lg`   | 20 / 28            | 600    | Section headings                   |
| `text-xl`   | 28 / 34            | 700    | Page titles                        |
| `text-2xl`  | 36 / 42            | 700    | Dashboard numbers, greeting        |

Weights: 400, 500, 600, 700 only. Numbers in tables and KPI cards use `tabular-nums`.

## Space, radius, shadow

- Space: Tailwind's 4 px scale. Use 1, 2, 3, 4, 6, 8, 12 (4 px to 48 px). Page padding is 6 on phone and 8 on desktop.
- Radius: `--radius-sm` 6 px (badges, inputs inside tables), `--radius-md` 8 px (buttons, inputs), `--radius-lg` 12 px (cards, panels), `--radius-full` for pills and avatars.
- Shadow: cards use a border, not a shadow. `--shadow-overlay` only for menus, popovers, dialogs and toasts.

## Layout

- Sidebar 248 px on desktop, icons only at 64 px when collapsed, a sheet on phone. The top bar is 56 px.
- Content max width 1280 px; forms max 640 px.
- Breakpoints: Tailwind defaults. Design phone first (360 px), then `md` (768) and `lg` (1024).

## Icons

`lucide-react`, 16 px in buttons and tables, 20 px in nav and 16 px in the collapsed icon rail, stroke width 1.75. No emoji in the UI.
