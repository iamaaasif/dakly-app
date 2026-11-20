import type { ContactImportField, ContactImportMapping } from '@dakly/contracts/contacts';

export const importFields: { field: ContactImportField; label: string; names: string[] }[] = [
  { field: 'phone', label: 'Phone', names: ['phone', 'phonenumber', 'mobile', 'mobilenumber'] },
  { field: 'name', label: 'Name', names: ['name', 'customername', 'fullname'] },
  { field: 'whatsappPhone', label: 'WhatsApp number', names: ['whatsapp', 'whatsappnumber'] },
  { field: 'email', label: 'Email', names: ['email', 'emailaddress'] },
  { field: 'address', label: 'Address', names: ['address'] },
  { field: 'district', label: 'District', names: ['district', 'area', 'city'] },
  { field: 'tags', label: 'Tags', names: ['tags', 'tag'] },
  { field: 'notes', label: 'Notes', names: ['notes', 'note'] },
];

// Matches column names such as "Mobile Number" so the owner only fixes what is wrong.
export function guessImportMapping(header: string[]): Partial<ContactImportMapping> {
  const plain = header.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const mapping: Partial<ContactImportMapping> = {};
  for (const { field, names } of importFields) {
    const column = plain.findIndex(
      (name, index) => names.includes(name) && !Object.values(mapping).includes(index),
    );
    if (column !== -1) mapping[field] = column;
  }
  return mapping;
}

// The schema counts every key, so a field left on "Do not import" must not be a key at all.
// A missing phone is still rejected by the schema.
export function dropUnmappedFields(mapping: Partial<ContactImportMapping>) {
  return Object.fromEntries(
    Object.entries(mapping).filter(([, column]) => column !== undefined),
  ) as ContactImportMapping;
}
