import { describe, expect, it } from 'vitest';

import type { AiService } from '../ai/ai.service';
import type { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { ProductsService } from '../products/products.service';
import type { UsageService } from '../usage/usage.service';
import type { ContentRepository } from './content.repository';
import { ContentService } from './content.service';

const storeId = '750b4d8c-a8a2-4bc7-8692-824ce8665060';
const actor = { kind: 'user', userId: 'c61fe399-ba8e-4544-ae8f-3a105ef0c91c' } as const;
const pieceId = '499095fd-48a2-4551-a042-30ea288806ed';

function serviceWith(repository: Partial<ContentRepository>) {
  const transaction = { run: (_store: string, work: () => unknown) => work() };
  return new ContentService(
    repository as ContentRepository,
    new Clock(),
    transaction as unknown as StoreTransaction,
    { record: async () => undefined } as unknown as AuditService,
    {} as AiService,
    {} as ProductsService,
    {} as UsageService,
  );
}

describe('ContentService', () => {
  it('returns empty fields for a store with no brand profile', async () => {
    const content = serviceWith({ findBrandProfile: async () => undefined });
    await expect(content.brandProfile(storeId)).resolves.toEqual({
      voice: null,
      audience: null,
      preferredWords: [],
      wordsToAvoid: [],
      callToActionBn: null,
      callToActionEn: null,
    });
  });

  it('rejects a copy when its source is missing', async () => {
    const content = serviceWith({ findPiece: async () => undefined });
    await expect(
      content.createPiece(storeId, actor, {
        sourcePieceId: pieceId,
        kind: 'sms',
        language: 'bn',
        body: 'অর্ডার করুন',
      }),
    ).rejects.toMatchObject({ code: 'CONTENT_PIECE_NOT_FOUND' });
  });
});
