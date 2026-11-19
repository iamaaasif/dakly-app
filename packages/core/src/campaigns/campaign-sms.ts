// Holds the approval time, so a campaign approved again after an edit reserves anew.
export function approvalKey(campaignId: string, approvedAt: Date): string {
  return `campaign-approval:${campaignId}:${approvedAt.toISOString()}`;
}

// CAMP-R4: every marketing SMS ends with the recipient's opt-out link.
export function marketingSmsText(text: string, optOutUrl: string): string {
  return `${text}\n${optOutUrl}`;
}

export function replacementKey(approval: string): string {
  return `${approval}:with-opt-out`;
}
