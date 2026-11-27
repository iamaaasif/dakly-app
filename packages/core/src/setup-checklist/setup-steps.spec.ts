import { describe, expect, it } from 'vitest';

import { setupStepIdsFor } from './setup-steps';

describe('setupStepIdsFor', () => {
  it('lists the three setup steps in order', () => {
    expect(setupStepIdsFor(['sales', 'chats', 'social_auto_post'])).toEqual([
      'add_store_details',
      'connect_channel',
      'add_products',
    ]);
  });

  it('leaves out steps whose extension is off', () => {
    expect(setupStepIdsFor(['sales'])).toEqual(['add_store_details', 'add_products']);
    expect(setupStepIdsFor(['chats'])).toEqual(['add_store_details', 'connect_channel']);
    expect(setupStepIdsFor([])).toEqual(['add_store_details']);
  });
});
