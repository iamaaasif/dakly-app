// Shared by the order rows and the inquiry rows so the two tabs look and feel the same.
export const rowClass =
  'relative grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-2.5 transition-colors hover:bg-surface-muted has-[[data-row-link]:focus-visible]:bg-surface-muted has-[[data-row-link]:focus-visible]:outline-2 has-[[data-row-link]:focus-visible]:-outline-offset-2 has-[[data-row-link]:focus-visible]:outline-focus md:grid-cols-[auto_1fr_auto_auto] md:gap-x-4';

// Stretched over the row, so a tap anywhere on it opens the order.
export const rowLinkClass =
  'max-w-full text-base font-semibold wrap-anywhere text-text outline-none after:absolute after:inset-0 hover:underline';

export const rowActionClass =
  'inline-flex min-h-11 w-fit items-center justify-center rounded-md bg-inverse px-3.5 text-sm font-medium text-on-primary transition-[background-color,transform,opacity] hover:bg-inverse/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.97] motion-reduce:active:scale-100 md:h-9 md:min-h-9';
