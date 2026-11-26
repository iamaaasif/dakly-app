import { describe, expect, it } from 'vitest';

import { contactDisplayName } from './contact-name';

describe('contactDisplayName', () => {
  it('uses the contact name when there is one', () => {
    expect(contactDisplayName({ contactName: 'Sadia Islam', channel: 'messenger' })).toBe(
      'Sadia Islam',
    );
  });

  it('names the channel when Meta gave no name', () => {
    expect(contactDisplayName({ contactName: null, channel: 'messenger' })).toBe(
      'Messenger customer',
    );
    expect(contactDisplayName({ contactName: null, channel: 'instagram' })).toBe(
      'Instagram customer',
    );
  });
});
