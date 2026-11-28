import { toAsciiDigits } from '@dakly/contracts/digits';
import { Input, type InputProps } from '@dakly/ui/input';

type DigitsInputProps = Omit<InputProps, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
};

// A whole number typed in Bangla or English digits; clearing the box gives null.
export function DigitsInput({ value, onChange, ...props }: DigitsInputProps) {
  return (
    <Input
      {...props}
      inputMode="numeric"
      autoComplete="off"
      value={value == null ? '' : String(value)}
      onChange={(event) => {
        const digits = toAsciiDigits(event.target.value).replace(/\D/gu, '').slice(0, 9);
        onChange(digits ? Number(digits) : null);
      }}
    />
  );
}
