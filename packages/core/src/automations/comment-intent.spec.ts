import { describe, expect, it } from 'vitest';

import { commentIntents, hasReadableWords } from './comment-intent';

describe('commentIntents', () => {
  it.each([
    ['দাম কত', ['price', 'question']],
    ['দামটা কত ভাই?', ['price', 'question']],
    ['dam koto', ['price', 'question']],
    ['Dam koto vai', ['price', 'question']],
    ['price?', ['price', 'question']],
    ['pp', ['price', 'question']],
    ['P.P please', ['price', 'question']],
    ['এটার price কত hobe', ['price', 'question']],
    ['order korbo, dam koto', ['price', 'order', 'question']],
    ['আমি নিব, inbox e details den', ['order', 'question']],
    ['size 38 ache?', ['question']],
    ['ami nibo', ['order']],
    ['অর্ডার করতে চাই', ['order']],
    ['very nice', []],
    ['damage product dilo', []],
    ['ppl are happy', []],
    ['😍😍😍', []],
    ['?', []],
    ['দাম কত? http://spam.example/win', []],
  ])('%s reads as %j', (text, expected) => {
    expect(commentIntents(text)).toEqual(expected);
  });

  it('treats emoji and links as unreadable', () => {
    expect(hasReadableWords('🔥🔥')).toBe(false);
    expect(hasReadableWords('www.example.com')).toBe(false);
    expect(hasReadableWords('দাম')).toBe(true);
  });
});
