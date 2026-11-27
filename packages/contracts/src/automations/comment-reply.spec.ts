import { describe, expect, it } from 'vitest';

import { privateReplyProblem, publicReplyProblem } from './comment-reply';

describe('publicReplyProblem', () => {
  it.each([
    'ইনবক্সে দাম জানিয়ে দিয়েছি',
    'Inbox e details dilam',
    'Sent you the details in Messenger',
    'ইনবক্স e dekhun vai',
  ])('allows %s', (text) => expect(publicReplyProblem(text)).toBeUndefined());

  it.each([
    '৪৫০ টাকা, inbox dekhun',
    'Price 450 only',
    'দাম ১২০০',
    'Call 01712345678',
    'only tk, inbox e dekhun',
    'দাম মাত্র টাকা',
    '$5 only',
    'Visit www.shop.com',
    'details at example.com',
  ])('rejects %s', (text) => expect(publicReplyProblem(text)).toBeDefined());
});

describe('privateReplyProblem', () => {
  it('allows words and an order number but not a typed price', () => {
    expect(privateReplyProblem('ধন্যবাদ! নিচে দাম দিলাম')).toBeUndefined();
    expect(privateReplyProblem('Dhonnobad, 2 din e delivery')).toBeUndefined();
    expect(privateReplyProblem('দাম ৫০০ টাকা')).toBeDefined();
    expect(privateReplyProblem('Price 500 tk')).toBeDefined();
  });
});
