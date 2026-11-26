import { expect } from '@playwright/test';

import type { createDatabase } from '@dakly/db/client';

export async function waitForProductIndex(
  database: ReturnType<typeof createDatabase>,
  storeId: string,
  productId: string,
  previousHash?: string,
) {
  let hash = '';
  await expect
    .poll(async () => {
      const { rows } = await database.pool.query<{ search_text_hash: string | null }>(
        'select search_text_hash from products where store_id=$1 and id=$2',
        [storeId, productId],
      );
      hash = rows[0]?.search_text_hash ?? '';
      return Boolean(hash && hash !== previousHash);
    })
    .toBe(true);
  return hash;
}
