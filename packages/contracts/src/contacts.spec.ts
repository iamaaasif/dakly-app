import { describe, expect, it } from 'vitest';

import {
  contactCountsQuerySchema,
  contactExportQuerySchema,
  contactListQuerySchema,
} from './contacts';

describe('hasOrdered', () => {
  it('reads true and false from the address', () => {
    expect(contactListQuerySchema.parse({ hasOrdered: 'true' }).hasOrdered).toBe(true);
    expect(contactListQuerySchema.parse({ hasOrdered: 'false' }).hasOrdered).toBe(false);
    expect(contactListQuerySchema.parse({}).hasOrdered).toBeUndefined();
  });

  it('is accepted by the export and the counts', () => {
    expect(contactExportQuerySchema.parse({ hasOrdered: 'true' }).hasOrdered).toBe(true);
    expect(contactCountsQuerySchema.parse({ hasOrdered: 'true' }).hasOrdered).toBe(true);
  });

  it('rejects other words', () => {
    expect(contactListQuerySchema.safeParse({ hasOrdered: 'maybe' }).success).toBe(false);
  });
});
