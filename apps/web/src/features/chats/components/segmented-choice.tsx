type SegmentedChoiceProps<Value extends string> = {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
  disabled?: boolean;
};

export function SegmentedChoice<Value extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: SegmentedChoiceProps<Value>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-surface-muted p-1"
    >
      {options.map((option) => (
        <label
          key={option.value}
          className="has-checked:shadow-sm flex min-h-10 cursor-pointer items-center justify-center rounded-md px-2 text-center text-base text-text-muted has-checked:bg-surface has-checked:font-medium has-checked:text-text has-focus-visible:outline-2 has-focus-visible:outline-focus has-disabled:cursor-not-allowed has-disabled:opacity-50"
        >
          <input
            type="radio"
            name={label}
            value={option.value}
            checked={option.value === value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
