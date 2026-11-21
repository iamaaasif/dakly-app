import {
  KHATA_CONFIDENCE_THRESHOLD,
  type ImportKhataPageInput,
  type KhataRowResponse,
} from '@dakly/contracts/khata-scans';

export type RowChoice = { skipped: boolean; checked: boolean; link: 'undecided' | 'yes' | 'no' };

export const untouchedChoice: RowChoice = { skipped: false, checked: false, link: 'undecided' };

// A match is a suggestion only. An exact phone match is used by the import itself (rule 4).
function linkedContactId(row: KhataRowResponse, choice: RowChoice): string | undefined {
  return row.match?.kind === 'similar_phone' && choice.link === 'yes'
    ? row.match.contactId
    : undefined;
}

// Baki and payments need a customer, so a row with no phone stays blocked until it is linked or skipped.
function needsPhone(row: KhataRowResponse, choice: RowChoice): boolean {
  return row.kind !== 'sale' && !row.phone && linkedContactId(row, choice) === undefined;
}

export function needsAttention(row: KhataRowResponse, choice: RowChoice): boolean {
  if (choice.skipped) return false;
  return (row.needsCheck && !choice.checked) || needsPhone(row, choice);
}

export function buildImportInput(
  rows: KhataRowResponse[],
  choices: Record<string, RowChoice>,
): ImportKhataPageInput {
  return {
    rows: rows.map((row) => {
      const choice = choices[row.id] ?? untouchedChoice;
      if (choice.skipped) return { rowId: row.id, action: 'skip' as const };
      const mergeContactId = linkedContactId(row, choice);
      return {
        rowId: row.id,
        action: 'import' as const,
        isChecked: choice.checked,
        ...(mergeContactId ? { mergeContactId } : {}),
      };
    }),
  };
}

// Counts for the result screen that the import response does not carry.
export function describeImported(rows: KhataRowResponse[], choices: Record<string, RowChoice>) {
  const imported = rows.filter((row) => !(choices[row.id] ?? untouchedChoice).skipped);
  return {
    matched: imported.filter(
      (row) =>
        row.match?.kind === 'phone' ||
        linkedContactId(row, choices[row.id] ?? untouchedChoice) !== undefined,
    ).length,
    walkIn: imported.filter((row) => row.kind === 'sale' && !row.phone).length,
  };
}

export function confidenceTone(confidence: number): 'success' | 'warning' | 'danger' {
  if (confidence >= KHATA_CONFIDENCE_THRESHOLD) return 'success';
  return confidence >= 70 ? 'warning' : 'danger';
}

export type RowStatus = { label: string; tone: 'success' | 'warning' | 'muted' };

export function rowStatus(row: KhataRowResponse, choice: RowChoice): RowStatus {
  if (choice.skipped) return { label: 'Skipped', tone: 'muted' };
  if (choice.checked) return { label: 'Checked', tone: 'success' };
  return needsAttention(row, choice)
    ? { label: 'Check this', tone: 'warning' }
    : { label: 'Looks right', tone: 'success' };
}
