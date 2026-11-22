import {
  assistantProductDraftSchema,
  type AssistantProductDraft,
} from '@dakly/contracts/assistant';

const DRAFT_PARAM = 'assistantDraft';

// A new product draft travels in the address, as More details does, so the server renders the
// Add product page already filled. It holds only what the owner typed to Ask Dakly AI.
export function assistantDraftHref(draft: AssistantProductDraft) {
  return `/products/new?${DRAFT_PARAM}=${encodeURIComponent(JSON.stringify(draft))}`;
}

export function parseAssistantDraft(
  raw: Record<string, string | string[] | undefined>,
): AssistantProductDraft | undefined {
  const value = [raw[DRAFT_PARAM]].flat()[0];
  if (!value) return undefined;
  try {
    const parsed = assistantProductDraftSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
