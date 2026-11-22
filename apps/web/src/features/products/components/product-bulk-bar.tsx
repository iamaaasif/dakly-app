import { Button } from '@dakly/ui/button';

type ProductBulkBarProps = {
  count: number;
  onEdit: (preset: 'hide' | 'category' | undefined) => void;
  onClear: () => void;
};

export function ProductBulkBar({ count, onEdit, onClear }: ProductBulkBarProps) {
  return (
    <div
      role="region"
      aria-label="Selected products"
      className="flex flex-wrap items-center gap-2 rounded-lg bg-primary-soft px-4 py-3"
    >
      <p className="text-sm font-medium text-text" aria-live="polite">
        {count} selected
      </p>
      <Button variant="secondary" onClick={() => onEdit(undefined)}>
        Edit in grid
      </Button>
      <Button variant="secondary" onClick={() => onEdit('hide')}>
        Hide
      </Button>
      <Button variant="secondary" onClick={() => onEdit('category')}>
        Set category
      </Button>
      <Button variant="secondary" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
