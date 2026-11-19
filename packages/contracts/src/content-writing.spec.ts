import { describe, expect, it } from 'vitest';

import { contentWriteRequestSchema, productDescriptionRequestSchema } from './content-writing';

describe('content writing request', () => {
  const preferences = { language: 'banglish', tone: 'friendly' };
  const productId = 'bb0121ec-d27d-481d-8d41-ecadb445515a';

  it('requires saved product facts for a product description', () => {
    const request = { ...preferences, operation: 'generate', kind: 'product_description' };
    expect(contentWriteRequestSchema.safeParse({ ...request, topic: 'Cotton shirt' }).success).toBe(
      false,
    );
    expect(contentWriteRequestSchema.safeParse({ ...request, productId }).success).toBe(true);
  });

  it('accepts a topic for a Facebook post', () => {
    const request = { ...preferences, operation: 'generate', kind: 'facebook_post', topic: 'Eid' };
    expect(contentWriteRequestSchema.parse(request)).toEqual(request);
  });

  it('requires text for an edit', () => {
    const request = { ...preferences, operation: 'translate', kind: 'sms' };
    expect(contentWriteRequestSchema.safeParse(request).success).toBe(false);
    expect(contentWriteRequestSchema.safeParse({ ...request, body: 'Order today' }).success).toBe(
      true,
    );
  });

  it('rejects unsaved facts from the product editor', () => {
    expect(
      productDescriptionRequestSchema.safeParse({ ...preferences, topic: 'Free delivery' }).success,
    ).toBe(false);
  });
});
