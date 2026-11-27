import type { Resolver } from 'react-hook-form';

import { type CreateContactInput, createContactSchema } from '@dakly/contracts/contacts';

export type ContactFormValues = {
  name: string;
  phone: string;
  sameAsMobile: boolean;
  whatsappPhone: string;
  email: string;
  gender: CreateContactInput['gender'];
  age: string;
  address: string;
  area: string;
  district: string;
  tags: string[];
  notes: string;
};

const blank = (text: string) => text.trim() || undefined;

// The design has an Area box; contacts keep one address line, so the area is added to its end.
export function toInput(values: ContactFormValues) {
  const address = [blank(values.address), blank(values.area)].filter(Boolean).join(', ');
  return {
    name: values.name,
    phone: values.phone,
    whatsappPhone: values.sameAsMobile ? undefined : blank(values.whatsappPhone),
    email: blank(values.email),
    gender: values.gender,
    age: blank(values.age) ? Number(values.age) : undefined,
    address: address || undefined,
    district: values.district,
    tags: values.tags.length ? values.tags : undefined,
    notes: blank(values.notes),
  };
}

const messages: Record<string, string> = {
  name: 'Enter a name, up to 120 characters.',
  email: 'Enter an email address such as name@email.com.',
  age: 'Enter an age from 1 to 120.',
};

export const contactFormResolver: Resolver<ContactFormValues> = (values) => {
  const parsed = createContactSchema.safeParse(toInput(values));
  if (parsed.success) return { values, errors: {} };
  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0]);
    errors[field] ??= { type: 'validation', message: messages[field] ?? issue.message };
  }
  return { values: {}, errors };
};

export const emptyContactValues: ContactFormValues = {
  name: '',
  phone: '',
  sameAsMobile: true,
  whatsappPhone: '',
  email: '',
  gender: undefined,
  age: '',
  address: '',
  area: '',
  district: 'Dhaka',
  tags: [],
  notes: '',
};
