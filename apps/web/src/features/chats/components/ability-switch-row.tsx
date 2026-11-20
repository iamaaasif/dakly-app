import { Switch } from '@dakly/ui/switch';

type AbilitySwitchRowProps = {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

export function AbilitySwitchRow({
  id,
  title,
  description,
  checked,
  disabled,
  onChange,
}: AbilitySwitchRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <label htmlFor={id} className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-text-muted">{description}</span>
      </label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
