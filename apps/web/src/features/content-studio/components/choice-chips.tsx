import { cn } from '@dakly/ui/cn';

type ChoiceChipsProps<Value extends string> = {
  legend: string;
  name: string;
  value: Value;
  choices: { value: Value; label: string }[];
  onChange: (value: Value) => void;
};

export function ChoiceChips<Value extends string>({
  legend,
  name,
  value,
  choices,
  onChange,
}: ChoiceChipsProps<Value>) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
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
                'flex min-h-10 items-center rounded-full border border-input-border px-3 text-sm',
                'peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-action',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
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
