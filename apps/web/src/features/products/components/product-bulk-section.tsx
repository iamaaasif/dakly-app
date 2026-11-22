import { type useBulkSelection } from '../use-bulk-selection';
import { ProductBulkBar } from './product-bulk-bar';
import { ProductBulkPanel } from './product-bulk-panel';
import { ProductBulkUndo } from './product-bulk-undo';

export function ProductBulkSection({ bulk }: { bulk: ReturnType<typeof useBulkSelection> }) {
  const { selected, editing, clear } = bulk;
  if (!bulk.selection) return null;
  return (
    <>
      <ProductBulkUndo />
      {selected.size ? (
        <ProductBulkBar count={selected.size} onEdit={bulk.startEditing} onClear={clear} />
      ) : null}
      {editing && selected.size ? (
        <ProductBulkPanel
          products={[...selected.values()]}
          preset={editing.preset}
          onClose={clear}
        />
      ) : null}
    </>
  );
}
