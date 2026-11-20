import { cn } from '@dakly/ui/cn';

type SegmentedChoiceProps<Value extends string> = {
  legend: string;
  name: string;
  value: Value;
  choices: { value: Value; label: string }[];
  onChange: (value: Value) => void;
};

export function SegmentedChoice<Value extends string>({
  legend,
  name,
  value,
  choices,
  onChange,
}: SegmentedChoiceProps<Value>) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex w-fit rounded-md bg-surface-muted p-1">
        {choices.map((choice) => (
          <label key={choice.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              className="peer sr-only"
              checked={value === choice.value}
              onChange={() => onChange(choice.value)}
            />
            <span
              className={cn(
                'rounded flex min-h-8 items-center px-3 text-sm',
                'peer-checked:shadow-sm peer-checked:bg-surface peer-checked:font-medium',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-focus',
              )}
            >
              {choice.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
