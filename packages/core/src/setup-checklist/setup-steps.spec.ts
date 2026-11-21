import { describe, expect, it } from 'vitest';

import { setupStepIdsFor } from './setup-steps';

describe('setupStepIdsFor', () => {
  it('lists the six social steps in order', () => {
    expect(setupStepIdsFor(['social_media'], ['sales', 'chats', 'social_auto_post'])).toEqual([
      'connect_facebook_page',
      'teach_ai_answers',
      'add_products',
      'chats_to_orders',
      'set_up_messaging',
      'send_first_campaign',
    ]);
  });

  it('leaves out steps whose extension is off', () => {
    expect(setupStepIdsFor(['social_media'], ['sales'])).toEqual([
      'add_products',
      'set_up_messaging',
      'send_first_campaign',
    ]);
  });

  it.each([[[]], [['online_store', 'shop_with_pos']]] as const)(
    'adds only the steps every store has for %j',
    (answers) => {
      expect(setupStepIdsFor([...answers], ['sales'])).toEqual([
        'set_up_messaging',
        'send_first_campaign',
      ]);
    },
  );
});
