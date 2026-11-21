import { contactKinds } from '@dakly/contracts/contacts';

// Fields that follow the merge rule "keep the kept contact's value unless it is empty".
export const fillFields = [
  'name',
  'phone',
  'phoneVerifiedAt',
  'whatsappPhone',
  'email',
  'gender',
  'birthdayDay',
  'birthdayMonth',
  'birthYear',
  'notes',
] as const;
// Address parts travel together, so a street never ends up under another district.
export const addressFields = ['address', 'district', 'bdAreaId'] as const;
export type ContactFields = {
  name: string | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  whatsappPhone: string | null;
  email: string | null;
  gender: string | null;
  birthdayDay: number | null;
  birthdayMonth: number | null;
  birthYear: number | null;
  notes: string | null;
  address: string | null;
  district: string | null;
  bdAreaId: number | null;
  kind: (typeof contactKinds)[number];
  notCustomerReason: string | null;
  isBlocked: boolean;
  tags: string[];
  updatedAt: Date;
};

export type MergeFieldName = Exclude<keyof ContactFields, 'updatedAt'>;

const linkedFields: string[][] = [
  ['phone', 'phoneVerifiedAt'],
  ['kind', 'notCustomerReason'],
  [...addressFields],
];

type Values = Record<string, unknown>;

// Values are stored as JSON, so dates compare by their ISO text.
export function jsonValue(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : (value ?? null);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

const kindRank: Record<ContactFields['kind'], number> = {
  not_customer: 0,
  chat_only: 1,
  lead: 2,
  customer: 3,
};

// What the kept contact gains from the merged one. Only changed fields appear, with the value
// before and after, so an undo can put back exactly what the merge changed.
export function planFieldMerge(kept: ContactFields, merged: ContactFields) {
  const before: Values = {};
  const after: Values = {};
  const change = (field: MergeFieldName, next: unknown) => {
    before[field] = jsonValue(kept[field]);
    after[field] = jsonValue(next);
  };
  fillEmpty(kept, merged, change);
  if (addressIsNewer(kept, merged)) for (const field of addressFields) change(field, merged[field]);
  if (kindRank[merged.kind] > kindRank[kept.kind]) {
    change('kind', merged.kind);
    change('notCustomerReason', merged.notCustomerReason);
  }
  if (merged.isBlocked && !kept.isBlocked) change('isBlocked', true);
  const tags = [...new Set([...kept.tags, ...merged.tags])];
  if (tags.length !== kept.tags.length) change('tags', tags);
  return { before, after };
}

function fillEmpty(
  kept: ContactFields,
  merged: ContactFields,
  change: (field: MergeFieldName, next: unknown) => void,
) {
  for (const field of fillFields) {
    // A verified time needs a phone, so it follows the phone and never comes alone.
    if (field === 'phoneVerifiedAt' && !(isEmpty(kept.phone) && !isEmpty(merged.phone))) continue;
    if (isEmpty(kept[field]) && !isEmpty(merged[field])) change(field, merged[field]);
  }
}

function addressIsNewer(kept: ContactFields, merged: ContactFields): boolean {
  if (isEmpty(merged.address) || merged.address === kept.address) return false;
  return isEmpty(kept.address) || merged.updatedAt.getTime() > kept.updatedAt.getTime();
}

// Undo puts a field back only while it still holds what the merge wrote. A later edit stays and
// is reported by field name, never by value.
export function planFieldUndo(current: ContactFields, before: Values, after: Values) {
  const restore: Values = {};
  const conflicts: string[] = [];
  for (const field of Object.keys(before)) {
    if (field === 'tags') {
      const added = new Set(
        stringList(after.tags).filter((tag) => !stringList(before.tags).includes(tag)),
      );
      const remaining = current.tags.filter((tag) => !added.has(tag));
      if (remaining.length !== current.tags.length) restore.tags = remaining;
    } else if (
      JSON.stringify(jsonValue(current[field as MergeFieldName])) === JSON.stringify(after[field])
    )
      restore[field] = before[field];
    else conflicts.push(field);
  }
  // Fields that must agree with each other are restored together or not at all.
  for (const group of linkedFields)
    if (group.some((field) => conflicts.includes(field)))
      for (const field of group) delete restore[field];
  return { restore, conflicts };
}
