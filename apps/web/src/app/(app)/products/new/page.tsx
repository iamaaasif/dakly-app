import Link from 'next/link';

import { NewProductPage } from '@/features/products/components/product-page';
import { parseQuickAddHandoff } from '@/features/products/quick-add-handoff';
import { parseAssistantDraft } from '@/lib/assistant-product-draft-link';
import { requireSession } from '@/lib/require-session';

export default async function NewProduct({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  if (!session.currentStore?.canEditProducts)
    return (
      <p role="status" className="p-6">
        You do not have access to add products in this shop. <Link href="/products">Back</Link>.
      </p>
    );
  const raw = await searchParams;
  return (
    <NewProductPage initial={parseQuickAddHandoff(raw)} assistantDraft={parseAssistantDraft(raw)} />
  );
}
