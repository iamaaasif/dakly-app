'use client';

export type SwitchProps = {
  id?: string;
  checked?: boolean;
  disabled?: boolean;
  'aria-labelledby'?: string;
  onCheckedChange: (checked: boolean) => void;
};

export function Switch({
  id,
  checked = false,
  disabled,
  onCheckedChange,
  'aria-labelledby': labelledBy,
}: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'border-transparent bg-primary' : 'border-input-border bg-surface-muted'
      }`}
    >
      <span
        aria-hidden="true"
        className={`shadow pointer-events-none inline-block size-5 transform rounded-full bg-surface ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
