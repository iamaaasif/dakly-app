import type { FieldErrors, Resolver } from 'react-hook-form';

import { contentWriteRequestSchema } from '@dakly/contracts/content-writing';

import { requestOf, type GenerateValues } from './generate-form-types';

// The schema has no idea or notes field, so it checks the request built from them; a topic problem
// shows under Notes.
export const writeResolver: Resolver<GenerateValues> = (values) => {
  const parsed = contentWriteRequestSchema.safeParse(requestOf(values));
  if (parsed.success) return { values, errors: {} };
  const errors: FieldErrors<GenerateValues> = {};
  for (const { path, message } of parsed.error.issues) {
    const field = path[0] === 'topic' ? 'notes' : (path[0] as keyof GenerateValues);
    errors[field] ??= { type: 'validation', message };
  }
  return { values: {}, errors };
};
