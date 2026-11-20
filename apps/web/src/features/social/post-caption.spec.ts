import { describe, expect, it } from 'vitest';

import { addHashtags } from './post-caption';

describe('addHashtags', () => {
  it('appends hashtags made from the longer words', () => {
    expect(addHashtags('New winter kurtis for you')).toBe(
      'New winter kurtis for you\n\n#winter #kurtis',
    );
  });

  it('leaves the caption alone when it has no usable words', () => {
    expect(addHashtags('Hi you')).toBe('Hi you');
  });

  it('skips hashtags the caption already has', () => {
    expect(addHashtags('Panjabi #panjabi cotton fabric')).toBe(
      'Panjabi #panjabi cotton fabric\n\n#cotton #fabric',
    );
  });
});
