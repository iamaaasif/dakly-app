import type { KnowledgeItemResponse } from '@dakly/contracts/knowledge';
import { Badge } from '@dakly/ui/badge';

export function KnowledgeItemStatus({ item }: { item: KnowledgeItemResponse }) {
  if (item.status === 'processing') return <Badge variant="warning">Reading…</Badge>;
  if (item.status === 'failed')
    return <Badge variant="danger">{item.failureReason ?? 'Could not read this'}</Badge>;
  if (item.kind === 'file') return <Badge variant="success">Learned {item.factsCount} facts</Badge>;
  return <Badge variant="success">Dakly knows this</Badge>;
}
