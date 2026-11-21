import type { KnowledgeItemResponse } from '@dakly/contracts/knowledge';

// A line of text under the name, in the colour of its state.
export function KnowledgeItemStatus({ item }: { item: KnowledgeItemResponse }) {
  if (item.status === 'processing') return <span className="text-sm text-warning">Reading…</span>;
  if (item.status === 'failed')
    return (
      <span className="text-sm text-danger">{item.failureReason ?? 'Could not read this'}</span>
    );
  if (item.kind === 'file' || item.kind === 'url')
    return <span className="text-sm text-success">Learned {item.factsCount} facts</span>;
  return <span className="text-sm text-success">Dakly knows this</span>;
}
